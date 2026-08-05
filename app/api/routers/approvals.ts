import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped, requireRoles } from "../scoped";
import { appendAudit, payloadHash } from "../audit";
import { actionPayloadHash } from "../policy/actionHash";
import { getStore } from "../store/drizzle";

/**
 * Integrity check for an approval row's stored hash. SEC-7: new rows carry
 * the canonical (kind, payload, destination) hash. Rows written before SEC-7
 * (earlier seed vintages) carry a payload-only hash — those stay DECIDABLE
 * here, but the policy gate binds actions strictly by the canonical hash, so
 * legacy rows can never authorize a new action (fail closed).
 */
export function approvalStoredHashMatches(approval: {
  kind: string;
  payload: unknown;
  payloadHash: string;
  destination: string;
}): boolean {
  return (
    approval.payloadHash ===
      actionPayloadHash({ kind: approval.kind, payload: approval.payload, destination: approval.destination }) ||
    approval.payloadHash === payloadHash(approval.payload)
  );
}

export const approvalsRouter = createRouter({
  list: authedQuery
    .input(z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const rows = await getDb().select().from(s.approvals).where(eq(s.approvals.tenantId, scope.tenantId)).orderBy(desc(s.approvals.createdAt));
      return rows.filter((a) => !input?.status || a.status === input.status);
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [approval] = await db.select().from(s.approvals).where(
      and(eq(s.approvals.tenantId, scope.tenantId), eq(s.approvals.id, input.id)),
    );
    if (!approval) throw new TRPCError({ code: "NOT_FOUND", message: "Approval not found" });
    // live freshness re-evaluation for the detail pane
    const fresh = approval.status === "approved"
      ? approval.expiresAt.getTime() > Date.now()
      : approval.expiresAt.getTime() > Date.now();
    return {
      approval,
      currentPayloadHash: actionPayloadHash({ kind: approval.kind, payload: approval.payload, destination: approval.destination }),
      hashMatches: approvalStoredHashMatches(approval),
      withinExpiry: fresh,
    };
  }),

  /** Payload-bound approve: hash must match exactly; A4 kinds are BOR-only. */
  decide: authedQuery
    .input(z.object({
      id: z.number(),
      decision: z.enum(["approved", "rejected"]),
      expectedPayloadHash: z.string().min(1),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const [approval] = await db.select().from(s.approvals).where(
        and(eq(s.approvals.tenantId, scope.tenantId), eq(s.approvals.id, input.id)),
      );
      if (!approval) throw new TRPCError({ code: "NOT_FOUND", message: "Approval not found" });
      if (approval.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: `Already ${approval.status}` });
      // SEC-6 partner: a consumed approval (usedAt set by the drainer-side
      // single-use consumer) can never be re-decided/re-purposed.
      if ((approval as { usedAt?: Date | null }).usedAt)
        throw new TRPCError({ code: "CONFLICT", message: "Approval already consumed by an executed action" });
      if (approval.expiresAt.getTime() <= Date.now())
        throw new TRPCError({ code: "CONFLICT", message: "Approval expired — payload must be re-reviewed" });
      if (!approvalStoredHashMatches(approval) || approval.payloadHash !== input.expectedPayloadHash)
        throw new TRPCError({ code: "CONFLICT", message: "Payload hash mismatch — you can only approve the exact payload shown" });
      if (approval.autonomyLevel === "A4") requireRoles(scope, ["broker_of_record"]);
      if (input.decision === "rejected" && !input.reason)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Rejection requires a reason" });
      // SEC-4: conditional UPDATE — the decision commits only if the row is
      // STILL pending at write time. A concurrent decide that slips past the
      // read-then-write window affects 0 rows and is rejected with CONFLICT.
      const result = await db.update(s.approvals).set({
        status: input.decision, decidedBy: scope.userId, decidedAt: new Date(), reason: input.reason ?? null,
      }).where(
        and(
          eq(s.approvals.id, approval.id),
          eq(s.approvals.tenantId, scope.tenantId),
          eq(s.approvals.status, "pending"),
        ),
      );
      if ((result[0]?.affectedRows ?? 0) === 0)
        throw new TRPCError({ code: "CONFLICT", message: "Approval was decided concurrently — refresh to see the final state" });
      const audit = await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: `approval.${input.decision}`, subjectType: "approval", subjectId: approval.id,
        payload: { kind: approval.kind, payloadHash: approval.payloadHash, destination: approval.destination, reason: input.reason ?? null },
      });
      return {
        ok: true,
        auditHash: audit.hash,
        // SEC-6 partner: the decided approval's binding coordinates, so the
        // consuming path (outbox drainer) can mark exactly this approval used.
        approval: {
          id: approval.id,
          kind: approval.kind,
          payloadHash: approval.payloadHash,
          destination: approval.destination,
          status: input.decision,
        },
      };
    }),
});
