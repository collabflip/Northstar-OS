import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const retentionResultSchema = z.object({
  actions: z.array(z.object({
    recordId: z.number(),
    action: z.enum(["retain", "anonymize", "destroy", "legal_hold"]),
    reason: z.string(),
  })),
});
export type RetentionResult = z.infer<typeof retentionResultSchema>;
export interface RetentionInput {
  records: { id: number; class: "fintrac" | "breach" | "consent" | "lead" | "id_document"; createdAt: string | Date; legalHold?: boolean; inactiveSince?: string | Date | null }[];
  now?: Date;
}

const YEAR = 365 * 86400000;

export const PrivacyRetention: AgentDef<RetentionInput, RetentionResult> = {
  meta: { name: "PrivacyRetention", promptVersion: "privacy-retention@1.0" },
  resultSchema: retentionResultSchema,
  run(input) {
    const now = input.now ?? new Date();
    const actions = input.records.map((r) => {
      if (r.legalHold) return { recordId: r.id, action: "legal_hold" as const, reason: "legal hold overrides schedule" };
      const ageMs = +now - +new Date(r.createdAt);
      switch (r.class) {
        case "fintrac":
          return ageMs < 5 * YEAR
            ? { recordId: r.id, action: "retain" as const, reason: "FINTRAC 5-year retention (FIN-08)" }
            : { recordId: r.id, action: "destroy" as const, reason: "past FINTRAC 5-year minimum — destruction logged" };
        case "breach":
          return ageMs < 2 * YEAR
            ? { recordId: r.id, action: "retain" as const, reason: "PIPEDA breach record 24-month minimum (PIPEDA-05)" }
            : { recordId: r.id, action: "destroy" as const, reason: "past 24-month breach-record minimum" };
        case "consent":
          return { recordId: r.id, action: "retain" as const, reason: "consent evidence retained indefinitely (CASL-07)" };
        case "id_document":
          return ageMs < 5 * YEAR
            ? { recordId: r.id, action: "retain" as const, reason: "ID record retained per FINTRAC schedule" }
            : { recordId: r.id, action: "destroy" as const, reason: "ID document securely destroyed after retention window (PIPEDA-03)" };
        default: {
          const inactive = r.inactiveSince ? +now - +new Date(r.inactiveSince) : ageMs;
          return inactive > 2 * YEAR
            ? { recordId: r.id, action: "anonymize" as const, reason: "inactive lead >2y — anonymize (PIPEDA-03 minimization)" }
            : { recordId: r.id, action: "retain" as const, reason: "active lead record" };
        }
      }
    });
    return agentResult(PrivacyRetention.meta, { actions }, {
      confidence: 0.9,
      rationale: `${actions.filter((a) => a.action !== "retain").length} retention action(s) scheduled; legal holds honoured first.`,
      riskClass: "medium",
      autonomyLevel: "A2",
      requiresHumanApproval: actions.some((a) => a.action === "destroy"),
      proposedAction: actions.some((a) => a.action === "destroy" || a.action === "anonymize")
        ? { kind: "privacy.retention_run", payload: { actions: actions.filter((a) => a.action !== "retain") }, destination: "retention-job" }
        : null,
    });
  },
};
