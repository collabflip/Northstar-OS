import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";

const STAGES = [
  "new_lead", "qualified", "consultation_booked", "dossier_ready",
  "strategy_proposed", "approved", "live_listing", "offer_review",
  "under_contract", "closed",
] as const;

export const dashboardRouter = createRouter({
  summary: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const contacts = await db.select().from(s.contacts).where(eq(s.contacts.tenantId, scope.tenantId));
    const activeStages = ["new_lead", "qualified", "consultation_booked", "dossier_ready", "strategy_proposed", "live_listing", "offer_review", "under_contract"];
    const pendingApprovals = await db.select().from(s.approvals).where(
      and(eq(s.approvals.tenantId, scope.tenantId), eq(s.approvals.status, "pending")),
    );
    const highIntent = contacts.filter((c) => (c.leadScore ?? 0) >= 80);
    const decisions = await db.select().from(s.policyDecisions).where(
      and(eq(s.policyDecisions.tenantId, scope.tenantId), gte(s.policyDecisions.createdAt, new Date(Date.now() - 7 * 86400000))),
    );
    const consents = await db.select().from(s.consentRecords).where(eq(s.consentRecords.tenantId, scope.tenantId));
    const expiring = consents.filter((c) => c.status === "active" && c.expiresAt && c.expiresAt.getTime() - Date.now() <= 30 * 86400000 && c.expiresAt.getTime() >= Date.now());
    const stageCounts = Object.fromEntries(STAGES.map((st) => [st, contacts.filter((c) => c.stage === st).length]));
    const fintracQueueCount = scope.role === "fintrac_officer" || scope.role === "broker_of_record" ? 1 : null;
    return {
      kpis: {
        activeSellerOpportunities: contacts.filter((c) => activeStages.includes(c.stage)).length,
        approvalsWaiting: pendingApprovals.length,
        oldestApprovalHours: pendingApprovals.length
          ? Math.round((Date.now() - Math.min(...pendingApprovals.map((a) => a.createdAt.getTime()))) / 3600000)
          : 0,
        highIntentLeads72h: highIntent.length,
        complianceItems: expiring.length,
      },
      pipelineSnapshot: stageCounts,
      autonomy: { ceiling: "A2", setBy: "broker of record" },
      policyGate: {
        decisions7d: decisions.length,
        passRatePct: decisions.length
          ? Math.round((decisions.filter((d) => d.verdict === "allow").length / decisions.length) * 1000) / 10
          : 100,
      },
      complianceAlerts: {
        consentsExpiring30d: expiring.length,
        fintracQueue: fintracQueueCount, // null = restricted (role-gated, FIN-07)
        dnclFlags: contacts.filter((c) => c.onDncl).length,
      },
    };
  }),

  recommendations: authedQuery.input(z.object({}).optional()).query(async ({ ctx }) => {
    await scoped(ctx);
    return [
      { id: 1, text: "Book Pelletier strategy review — dossier confidence reached 87%", evidenceKind: "generated" },
      { id: 2, text: "Request missing utility-cost info for DEMO-ON-PROPERTY-002", evidenceKind: "missing" },
      { id: 3, text: "Refresh comparables for DEMO-ON-PROPERTY-003 — data 9 days old", evidenceKind: "stale" },
    ];
  }),
});
