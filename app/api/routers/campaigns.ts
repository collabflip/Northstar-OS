import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";
import { appendAudit } from "../audit";
import { DrizzleStore } from "../store/drizzle";
import { evaluateAction } from "../policy/engine";
import { actionPayloadHash } from "../policy/actionHash";

export const campaignsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    return getDb().select().from(s.campaigns).where(eq(s.campaigns.tenantId, scope.tenantId)).orderBy(desc(s.campaigns.id));
  }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [campaign] = await db.select().from(s.campaigns).where(
      and(eq(s.campaigns.tenantId, scope.tenantId), eq(s.campaigns.id, input.id)),
    );
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
    const messages = await db.select().from(s.campaignMessages).where(eq(s.campaignMessages.campaignId, campaign.id));
    return { campaign, messages };
  }),

  /** Launch request — always gated; verdict != allow routes to approvals. */
  launch: authedQuery
    .input(z.object({ id: z.number(), approvalId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const [campaign] = await db.select().from(s.campaigns).where(
        and(eq(s.campaigns.tenantId, scope.tenantId), eq(s.campaigns.id, input.id)),
      );
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      // F5: ONE canonical payload object — hashed identically by the gate,
      // the persisted approval row, and the outbox intent the drainer re-gates.
      const canonicalPayload = {
        campaignId: campaign.id,
        audience: campaign.audience ?? null,
        budgetCapCents: campaign.budgetCapCents ?? null,
      };
      const destination = "comms:mock";
      const actionRef = { kind: "campaign.launch", payload: canonicalPayload, destination };
      // DB-5: the launch write set (policy decision → approval row → campaign
      // status → outbox intent → audit entry) is ONE SQL transaction — a
      // failure mid-flow rolls everything back instead of leaving e.g. an
      // approved campaign + outbox row with no audit entry.
      return db.transaction(async (tx) => {
        const txStore = new DrizzleStore(tx as never);
        const decision = await evaluateAction(txStore, { tenantId: scope.tenantId, actorId: scope.userId }, {
          kind: actionRef.kind,
          payload: canonicalPayload,
          destination,
          idempotencyKey: `campaign_launch_${campaign.id}`,
          requiresApproval: true,
          approvalId: input.approvalId,
          budgetCapCents: campaign.budgetCapCents ?? undefined,
          campaignId: campaign.id,
          autonomyLevel: campaign.autonomyLevel as "A0" | "A1" | "A2" | "A3" | "A4",
        });
        if (decision.verdict === "escalate") {
          // F5(a): persist an approval row carrying the exact payload + hash so
          // the escalation can actually be decided in the Approval Inbox.
          const hash = actionPayloadHash(actionRef);
          let approval = await txStore.findApprovalByPayloadHash(scope.tenantId, actionRef.kind, hash);
          if (!approval || approval.status === "rejected") {
            const [row] = await tx.insert(s.approvals).values({
              tenantId: scope.tenantId,
              kind: actionRef.kind,
              title: `Launch campaign: ${campaign.name}`,
              payload: canonicalPayload,
              payloadHash: hash,
              destination,
              policyDecisionId: decision.decisionId,
              requestedBy: `user:${scope.userId}@tenant:${scope.tenantId}`,
              requestedByUserId: scope.userId,
              autonomyLevel: campaign.autonomyLevel,
              expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
            }).$returningId();
            approval = await txStore.getApproval(scope.tenantId, row.id);
          }
          await tx.update(s.campaigns).set({ status: "pending_approval" }).where(eq(s.campaigns.id, campaign.id));
          return { launched: false, verdict: decision.verdict, approvalId: approval!.id, policyDecisionId: decision.decisionId, reasons: decision.checks.filter((c) => !c.ok) };
        }
        if (decision.verdict !== "allow") {
          return { launched: false, verdict: decision.verdict, policyDecisionId: decision.decisionId, reasons: decision.checks.filter((c) => !c.ok) };
        }
        await tx.update(s.campaigns).set({ status: "approved" }).where(eq(s.campaigns.id, campaign.id));
        await txStore.enqueueOutbox({
          tenantId: scope.tenantId,
          idempotencyKey: `campaign_launch_send_${campaign.id}`,
          action: actionRef.kind,
          // F5(b): the drainer re-hashes THIS exact payload — identical to what
          // the gate and the approval row used, so a decided approval matches.
          payload: { action: actionRef.kind, payload: canonicalPayload, destination, campaignId: campaign.id, budgetCapCents: campaign.budgetCapCents ?? undefined, requiresApproval: true, approvalId: input.approvalId, actorId: scope.userId, autonomyLevel: campaign.autonomyLevel },
        });
        await appendAudit(txStore, {
          tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
          action: "campaign.launch", subjectType: "campaign", subjectId: campaign.id,
          payload: { approvalId: input.approvalId ?? null }, policyDecisionId: decision.decisionId,
        });
        return { launched: true, verdict: "allow" as const, policyDecisionId: decision.decisionId };
      });
    }),
});
