import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";
import { evaluateAction } from "../policy/engine";

export const pipelineRouter = createRouter({
  board: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const rows = await db
      .select({ contact: s.contacts, property: s.properties })
      .from(s.contacts)
      .leftJoin(s.properties, and(eq(s.properties.ownerContactId, s.contacts.id), eq(s.properties.tenantId, s.contacts.tenantId)))
      .where(eq(s.contacts.tenantId, scope.tenantId));
    const cards = rows.map(({ contact, property }) => ({
      contactId: contact.id,
      name: contact.preferredName ?? `${contact.firstName} ${contact.lastName}`,
      stage: contact.stage,
      leadScore: contact.leadScore,
      leadScoreReasons: contact.leadScoreReasons,
      leadSource: contact.leadSource,
      isSrp: contact.isSrp,
      address: property ? `${property.addressLine1}, ${property.city}` : null,
      propertyId: property?.id ?? null,
    }));
    const stages = [...new Set(cards.map((c) => c.stage).concat(["new_lead", "qualified", "consultation_booked", "dossier_ready", "strategy_proposed", "approved", "live_listing", "offer_review", "under_contract", "closed"]))];
    return { stages, cards };
  }),

  moveCard: authedQuery
    .input(z.object({
      contactId: z.number(),
      toStage: z.enum(["new_lead", "qualified", "consultation_booked", "dossier_ready", "strategy_proposed", "approved", "live_listing", "offer_review", "under_contract", "closed"]),
      approvalId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const store = getStore();
      const [contact] = await db.select().from(s.contacts).where(
        and(eq(s.contacts.tenantId, scope.tenantId), eq(s.contacts.id, input.contactId)),
      );
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      // gated moves (approved and beyond) run the commit-time gate
      const gated = ["approved", "live_listing"].includes(input.toStage);
      let policyDecisionId: number | null = null;
      if (gated) {
        const decision = await evaluateAction(store, {
          tenantId: scope.tenantId, actorId: scope.userId,
        }, {
          kind: "strategy.approve",
          payload: { contactId: input.contactId, toStage: input.toStage },
          destination: `pipeline:contact:${input.contactId}`,
          idempotencyKey: `pipeline_move_${input.contactId}_${input.toStage}`,
          requiresApproval: true,
          approvalId: input.approvalId,
        });
        policyDecisionId = decision.decisionId;
        if (decision.verdict !== "allow") {
          return { moved: false, verdict: decision.verdict, policyDecisionId, reasons: decision.checks.filter((c) => !c.ok) };
        }
      }
      await db.update(s.contacts).set({ stage: input.toStage }).where(
        and(eq(s.contacts.tenantId, scope.tenantId), eq(s.contacts.id, input.contactId)),
      );
      const audit = await appendAudit(store, {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "pipeline.move", subjectType: "contact", subjectId: input.contactId,
        payload: { from: contact.stage, to: input.toStage }, policyDecisionId,
      });
      return { moved: true, verdict: gated ? "allow" : "ungated", policyDecisionId, auditHash: audit.hash };
    }),
});
