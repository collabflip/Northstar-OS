import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const compScoredSchema = z.object({
  id: z.number(),
  relevanceScore: z.number(),
  selectionReasoning: z.string(),
  adjustments: z.array(z.object({ factor: z.string(), amountCad: z.number(), basis: z.string() })),
  adjustedPrice: z.number(),
});
export const compSelectionSchema = z.object({
  selected: z.array(compScoredSchema),
  excluded: z.array(z.object({ id: z.number(), reason: z.string() })),
});
export type CompSelectionResult = z.infer<typeof compSelectionSchema>;
export interface CompCandidate {
  id: number;
  address: string;
  soldPrice: number;
  soldDate: string | Date;
  beds: number;
  baths: number;
  sqft: number;
  distanceKm: number;
  atypical?: string;
}
export interface CompInput {
  subject: { beds: number; baths: number; sqft: number };
  candidates: CompCandidate[];
  now?: Date;
}

const SQFT_RATE = 600; // $/sqft adjustment basis

export const ComparableSelection: AgentDef<CompInput, CompSelectionResult> = {
  meta: { name: "ComparableSelection", promptVersion: "comparable-selection@1.0" },
  resultSchema: compSelectionSchema,
  run(input) {
    const now = input.now ?? new Date();
    const selected: CompSelectionResult["selected"] = [];
    const excluded: CompSelectionResult["excluded"] = [];
    for (const c of input.candidates) {
      const monthsOld = (+now - +new Date(c.soldDate)) / (30.44 * 24 * 3600 * 1000);
      if (c.atypical) { excluded.push({ id: c.id, reason: `Excluded: ${c.atypical}` }); continue; }
      if (c.distanceKm > 1.5) { excluded.push({ id: c.id, reason: "Excluded: >1.5 km" }); continue; }
      if (monthsOld > 12) { excluded.push({ id: c.id, reason: "Excluded: sale older than 12 months" }); continue; }
      const sqftDiffPct = Math.abs(c.sqft - input.subject.sqft) / input.subject.sqft;
      const score = Math.max(0, Math.min(100, Math.round(
        100 - c.distanceKm * 20 - monthsOld * 2
        - Math.abs(c.beds - input.subject.beds) * 8
        - Math.abs(c.baths - input.subject.baths) * 5
        - sqftDiffPct * 30,
      )));
      if (score < 40) { excluded.push({ id: c.id, reason: `Excluded: relevance score ${score} < 40` }); continue; }
      const adjustments: CompSelectionResult["selected"][number]["adjustments"] = [];
      const sqftDelta = input.subject.sqft - c.sqft;
      if (Math.abs(sqftDelta) >= 100)
        adjustments.push({ factor: "living area", amountCad: Math.round((sqftDelta * SQFT_RATE) / 1000) * 1000, basis: `$${SQFT_RATE}/sqft local paired-sale basis` });
      if (c.baths < input.subject.baths)
        adjustments.push({ factor: "bath count", amountCad: (input.subject.baths - c.baths) * 12000, basis: "standard bath adjustment" });
      const adjustedPrice = c.soldPrice + adjustments.reduce((s, a) => s + a.amountCad, 0);
      selected.push({
        id: c.id, relevanceScore: score, adjustedPrice, adjustments,
        selectionReasoning:
          `Selected: ${c.address} — ${Math.round(c.distanceKm * 1000)} m, sold ${monthsOld.toFixed(1)} mo ago, ` +
          `${c.beds}/${c.baths} vs subject ${input.subject.beds}/${input.subject.baths}` +
          (adjustments.length ? `, adjusted ${adjustments.map((a) => `${a.factor} ${a.amountCad >= 0 ? "+" : ""}$${(a.amountCad / 1000).toFixed(0)}k`).join(", ")}` : ", no adjustment needed") + ".",
      });
    }
    selected.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return agentResult(ComparableSelection.meta, { selected: selected.slice(0, 7), excluded }, {
      confidence: selected.length >= 3 ? 0.85 : 0.5,
      assumptions: selected.length < 3 ? ["thin comp set — range will widen"] : [],
      rationale: `${selected.length} comp(s) selected by distance/recency/similarity scoring; ${excluded.length} excluded with reasons.`,
      autonomyLevel: "A1",
    });
  },
};
