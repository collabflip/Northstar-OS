import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const sentinelResultSchema = z.object({
  blockRatePct: z.number(),
  alerts: z.array(z.object({ severity: z.enum(["info", "medium", "high"]), ruleId: z.string().nullable(), message: z.string() })),
  consentExpiring: z.array(z.object({ contactId: z.number(), channel: z.string(), daysLeft: z.number() })),
});
export type SentinelResult = z.infer<typeof sentinelResultSchema>;
export interface SentinelInput {
  decisions: { verdict: string; ruleIds: string[]; action: string }[];
  consents: { contactId: number; channel: string; basis: string; status: string; expiresAt?: string | Date | null }[];
  now?: Date;
  expiringWindowDays?: number;
}

export const ComplianceSentinel: AgentDef<SentinelInput, SentinelResult> = {
  meta: { name: "ComplianceSentinel", promptVersion: "compliance-sentinel@1.0" },
  resultSchema: sentinelResultSchema,
  run(input) {
    const now = input.now ?? new Date();
    const window = input.expiringWindowDays ?? 30;
    const blocked = input.decisions.filter((d) => d.verdict === "block");
    const blockRatePct = input.decisions.length ? Math.round((blocked.length / input.decisions.length) * 1000) / 10 : 0;
    const alerts: SentinelResult["alerts"] = [];
    for (const d of blocked) {
      if (d.ruleIds.some((r) => r.startsWith("FIN-")))
        alerts.push({ severity: "high", ruleId: d.ruleIds[0] ?? null, message: `FINTRAC-relevant block on ${d.action}` });
    }
    if (blockRatePct > 10)
      alerts.push({ severity: "medium", ruleId: null, message: `block rate ${blockRatePct}% above 10% review threshold` });
    const consentExpiring = input.consents
      .filter((c) => c.status === "active" && c.expiresAt)
      .map((c) => ({ contactId: c.contactId, channel: c.channel, daysLeft: Math.ceil((+new Date(c.expiresAt!) - +now) / 86400000) }))
      .filter((c) => c.daysLeft >= 0 && c.daysLeft <= window)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    if (consentExpiring.length)
      alerts.push({ severity: "info", ruleId: "CASL-03", message: `${consentExpiring.length} consent(s) expiring within ${window} days` });
    return agentResult(ComplianceSentinel.meta, { blockRatePct, alerts, consentExpiring }, {
      confidence: 0.9,
      rationale: `${blocked.length}/${input.decisions.length} decisions blocked; ${consentExpiring.length} consent(s) expiring soon.`,
      riskClass: alerts.some((a) => a.severity === "high") ? "regulated" : "medium",
      autonomyLevel: "A1",
    });
  },
};
