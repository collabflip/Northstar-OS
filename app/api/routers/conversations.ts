import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";
import { evaluateAction } from "../policy/engine";
import { ConversationalLead } from "../agents";

export const conversationsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const convos = await db.select().from(s.conversations).where(eq(s.conversations.tenantId, scope.tenantId)).orderBy(desc(s.conversations.updatedAt));
    if (convos.length === 0) return [];
    // ARCH-6: batch the per-conversation lookups (was 2N+1) — one contacts
    // query + one messages query, same output shape and tenant predicates.
    const contactIds = [...new Set(convos.map((c) => c.contactId))];
    const convoIds = convos.map((c) => c.id);
    const [contactRows, msgRows] = await Promise.all([
      db.select().from(s.contacts).where(and(eq(s.contacts.tenantId, scope.tenantId), inArray(s.contacts.id, contactIds))),
      db.select().from(s.messages).where(inArray(s.messages.conversationId, convoIds)).orderBy(desc(s.messages.id)),
    ]);
    const contactById = new Map(contactRows.map((c) => [c.id, c]));
    // msgRows are id-desc — first occurrence per conversation is its last message.
    const lastMsgByConvo = new Map<number, (typeof msgRows)[number]>();
    for (const m of msgRows) {
      if (!lastMsgByConvo.has(m.conversationId)) lastMsgByConvo.set(m.conversationId, m);
    }
    return convos.map((c) => {
      const contact = contactById.get(c.contactId);
      return {
        conversation: c,
        contactName: contact ? `${contact.firstName} ${contact.lastName}` : "Unknown",
        leadScore: contact?.leadScore ?? null,
        lastMessage: lastMsgByConvo.get(c.id) ?? null,
      };
    });
  }),

  thread: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [conversation] = await db.select().from(s.conversations).where(
      and(eq(s.conversations.tenantId, scope.tenantId), eq(s.conversations.id, input.id)),
    );
    if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
    const msgs = await db.select().from(s.messages).where(eq(s.messages.conversationId, conversation.id)).orderBy(s.messages.id);
    const [contact] = await db.select().from(s.contacts).where(and(eq(s.contacts.tenantId, scope.tenantId), eq(s.contacts.id, conversation.contactId)));
    return { conversation, messages: msgs, contact: contact ?? null };
  }),

  /** AI draft (A1) — grounded or refused; nothing sends from this procedure. */
  draftReply: authedQuery.input(z.object({ conversationId: z.number() })).mutation(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [conversation] = await db.select().from(s.conversations).where(
      and(eq(s.conversations.tenantId, scope.tenantId), eq(s.conversations.id, input.conversationId)),
    );
    if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
    const [contact] = await db.select().from(s.contacts).where(and(eq(s.contacts.tenantId, scope.tenantId), eq(s.contacts.id, conversation.contactId)));
    const msgs = await db.select().from(s.messages).where(eq(s.messages.conversationId, conversation.id)).orderBy(s.messages.id);
    const evidenceRows = await db.select().from(s.evidence).where(eq(s.evidence.tenantId, scope.tenantId)).limit(50);
    const result = ConversationalLead.run({
      contactName: contact ? `${contact.firstName} ${contact.lastName}` : "there",
      isSrp: contact?.isSrp ?? false,
      inboundMessages: msgs.filter((m) => m.direction === "inbound").map((m) => m.body),
      evidenceCorpus: evidenceRows.map((e) => ({ id: String(e.id), statement: e.statement })),
    });
    if (result.result.escalation) {
      await db.update(s.conversations).set({ status: "escalated" }).where(eq(s.conversations.id, conversation.id));
    }
    const [{ id }] = await db.insert(s.messages).values({
      tenantId: scope.tenantId,
      conversationId: conversation.id,
      direction: "outbound",
      body: result.result.draft ?? `[DRAFT REFUSED] ${result.result.blockedReason ?? "escalated to human"}`,
      groundedEvidenceIds: result.result.groundedEvidenceIds,
      aiDisclosed: true,
      isAiDraft: true,
      escalation: result.result.escalation,
      status: result.result.draft ? "draft" : "blocked",
    }).$returningId();
    await appendAudit(getStore(), {
      tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
      action: "conversation.draft", subjectType: "conversation", subjectId: conversation.id,
      payload: { draftId: id, escalation: result.result.escalation, grounded: result.result.groundedEvidenceIds },
      modelVersion: result.modelVersion, promptVersion: result.promptVersion,
    });
    return { draftMessageId: id, agent: result };
  }),

  /** Human-approved send — runs the commit-time policy gate, then outbox. */
  sendMessage: authedQuery
    .input(z.object({
      conversationId: z.number(),
      messageId: z.number().optional(),
      body: z.string().min(1),
      idempotencyKey: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const store = getStore();
      const [conversation] = await db.select().from(s.conversations).where(
        and(eq(s.conversations.tenantId, scope.tenantId), eq(s.conversations.id, input.conversationId)),
      );
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      if (conversation.status === "escalated" && scope.role !== "broker_of_record")
        throw new TRPCError({ code: "FORBIDDEN", message: "Thread escalated — A4 licensed registrant only" });
      const decision = await evaluateAction(store, { tenantId: scope.tenantId, actorId: scope.userId }, {
        kind: "cem.send",
        payload: { conversationId: conversation.id, body: input.body },
        destination: `comms:${conversation.channel}:contact:${conversation.contactId}`,
        idempotencyKey: input.idempotencyKey,
        channel: conversation.channel,
        contactId: conversation.contactId,
        purpose: "transaction",
        text: input.body,
        transactionalJustification: "direct reply in an open client conversation (non-promotional)",
        agentGenerated: true,
        audit: { modelVersion: "mock-deterministic-1", promptVersion: "conversational-lead@1.0" },
      });
      if (decision.verdict !== "allow") {
        return { sent: false, verdict: decision.verdict, policyDecisionId: decision.decisionId, reasons: decision.checks.filter((c) => !c.ok) };
      }
      await store.enqueueOutbox({
        tenantId: scope.tenantId,
        idempotencyKey: input.idempotencyKey,
        action: "cem.send",
        payload: {
          action: "cem.send", payload: { conversationId: conversation.id, body: input.body },
          destination: `comms:${conversation.channel}:contact:${conversation.contactId}`,
          channel: conversation.channel, contactId: conversation.contactId,
          purpose: "transaction", text: input.body,
        },
      });
      await appendAudit(store, {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "conversation.send", subjectType: "conversation", subjectId: conversation.id,
        payload: { idempotencyKey: input.idempotencyKey }, policyDecisionId: decision.decisionId,
      });
      return { sent: true, verdict: "allow", policyDecisionId: decision.decisionId };
    }),
});
