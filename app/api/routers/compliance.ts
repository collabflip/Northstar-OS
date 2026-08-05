import { and, eq, gte } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped, requireFintracOfficer } from "../scoped";
import { canSeeFintrac, isFintracTaskKind } from "../lib/fintrac";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";

export const complianceRouter = createRouter({
  overview: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const consents = await db.select().from(s.consentRecords).where(eq(s.consentRecords.tenantId, scope.tenantId));
    const suppressions = await db.select().from(s.suppressionList).where(eq(s.suppressionList.tenantId, scope.tenantId));
    const contacts = await db.select().from(s.contacts).where(eq(s.contacts.tenantId, scope.tenantId));
    const decisions = await db.select().from(s.policyDecisions).where(
      and(eq(s.policyDecisions.tenantId, scope.tenantId), gte(s.policyDecisions.createdAt, new Date(Date.now() - 7 * 86400000))),
    );
    const now = Date.now();
    const state = (c: (typeof consents)[number]) =>
      c.status === "withdrawn" ? "suppressed"
      : c.status === "expired" || (c.expiresAt && c.expiresAt.getTime() <= now) ? "expired"
      : c.basis;
    const counts = { express: 0, implied: 0, expired: 0, suppressed: suppressions.length };
    for (const c of consents) {
      const st = state(c);
      if (st === "express") counts.express++;
      else if (st === "implied") counts.implied++;
      else if (st === "expired") counts.expired++;
    }
    const expiring = consents.filter((c) => c.status === "active" && c.expiresAt && c.expiresAt.getTime() > now && c.expiresAt.getTime() - now <= 30 * 86400000);
    let fintracTaskCount = 0;
    if (canSeeFintrac(scope.role)) {
      const tasks = await db.select().from(s.transactionTasks).where(eq(s.transactionTasks.tenantId, scope.tenantId));
      fintracTaskCount = tasks.filter((t) => isFintracTaskKind(t.kind)).length;
    }
    return {
      jurisdiction: "Ontario policy pack v2026.1",
      disclaimer: "Software supports compliance workflows — it does not guarantee legal compliance.",
      casl: { ...counts, expiringSoon: expiring.length },
      dncl: { flags: contacts.filter((c) => c.onDncl).length, internalDnc: contacts.filter((c) => c.onInternalDnc).length, lastRegistrySync: "Jun 1 — mock provider" },
      // F3: anti-tipping-off — the FINTRAC queue count is fintrac_officer only;
      // broker_of_record and everyone else see "restricted".
      fintracQueue: canSeeFintrac(scope.role)
        ? { count: fintracTaskCount }
        : "restricted",
      policyDecisions7d: {
        total: decisions.length,
        passRatePct: decisions.length ? Math.round((decisions.filter((d) => d.verdict === "allow").length / decisions.length) * 1000) / 10 : 100,
      },
    };
  }),

  /**
   * FIN-07: STR/FINTRAC queue is visible ONLY to fintrac_officer. Access is
   * audited BEFORE authorization (anti-tipping-off evidence trail).
   * This is a MUTATION (not a query): it performs an explicit audit-log write
   * on every call, so it must never be reachable via a side-effect-free GET.
   */
  fintracQueue: authedQuery.mutation(async ({ ctx }) => {
    const scope = await scoped(ctx);
    await appendAudit(getStore(), {
      tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
      action: "compliance.fintrac_queue_view_attempt", subjectType: "fintrac_queue", subjectId: "main",
      payload: { granted: scope.role === "fintrac_officer" },
    });
    requireFintracOfficer(scope);
    const db = getDb();
    const tasks = await db.select().from(s.transactionTasks).where(
      and(eq(s.transactionTasks.tenantId, scope.tenantId)),
    );
    return tasks.filter((t) => t.kind.startsWith("fintrac_"));
  }),

  suppressionList: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    return getDb().select().from(s.suppressionList).where(eq(s.suppressionList.tenantId, scope.tenantId));
  }),
});
