import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const dossierResultSchema = z.object({
  profile: z.array(z.object({
    field: z.string(),
    value: z.string(),
    kind: z.enum(["verified", "third_party", "estimate", "generated", "assumption"]),
    sourceName: z.string(),
  })),
  contradictions: z.array(z.object({ field: z.string(), values: z.array(z.string()) })),
  missingInfo: z.array(z.string()),
});
export type DossierResult = z.infer<typeof dossierResultSchema>;
export interface DossierInput {
  facts: { field: string; value: string; sourceName: string; kind: "verified" | "third_party" | "estimate" | "assumption" }[];
}

const EXPECTED = ["lot", "beds", "baths", "sqft", "taxes", "parking", "yearBuilt", "basement"];

export const PropertyDossier: AgentDef<DossierInput, DossierResult> = {
  meta: { name: "PropertyDossier", promptVersion: "property-dossier@1.0" },
  resultSchema: dossierResultSchema,
  run(input) {
    const byField = new Map<string, DossierInput["facts"]>();
    for (const f of input.facts) {
      const list = byField.get(f.field) ?? [];
      list.push(f);
      byField.set(f.field, list);
    }
    const profile: DossierResult["profile"] = [];
    const contradictions: DossierResult["contradictions"] = [];
    const conflicts: string[] = [];
    const rank = { verified: 4, third_party: 3, estimate: 2, assumption: 1, generated: 0 } as const;
    for (const [field, rows] of byField) {
      const values = [...new Set(rows.map((r) => r.value))];
      const best = [...rows].sort((a, b) => rank[b.kind] - rank[a.kind])[0];
      profile.push({ field, value: best.value, kind: best.kind, sourceName: best.sourceName });
      if (values.length > 1) {
        contradictions.push({ field, values });
        conflicts.push(`${field}: ${values.join(" vs ")} — unresolved`);
      }
    }
    const missingInfo = EXPECTED.filter((e) => !byField.has(e));
    return agentResult(PropertyDossier.meta, {
      profile: profile.sort((a, b) => a.field.localeCompare(b.field)),
      contradictions,
      missingInfo,
    }, {
      confidence: Math.max(0.3, 1 - contradictions.length * 0.15 - missingInfo.length * 0.05),
      evidenceIds: profile.map((p) => `${p.field}:${p.sourceName}`),
      unresolvedConflicts: conflicts,
      assumptions: missingInfo.map((m) => `${m} not yet sourced`),
      rationale: `${profile.length} profile rows resolved (highest-quality source wins); ${contradictions.length} contradiction(s), ${missingInfo.length} gap(s).`,
      riskClass: contradictions.length ? "medium" : "low",
      autonomyLevel: "A1",
    });
  },
};
