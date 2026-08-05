import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const buyerMatchSchema = z.object({
  matches: z.array(z.object({ listingId: z.number(), score: z.number(), reasons: z.array(z.string()) })),
  refusedCriteria: z.array(z.string()),
});
export type BuyerMatchResult = z.infer<typeof buyerMatchSchema>;
export interface BuyerMatchInput {
  criteria: { minBeds?: number; maxPrice?: number; mustHave?: string[]; demographic?: string };
  listings: { id: number; address: string; beds: number; price: number; features: string[] }[];
}

export const BuyerMatch: AgentDef<BuyerMatchInput, BuyerMatchResult> = {
  meta: { name: "BuyerMatch", promptVersion: "buyer-match@1.0" },
  resultSchema: buyerMatchSchema,
  run(input) {
    const c = input.criteria;
    if (c.demographic && c.demographic.trim().length > 0) {
      return agentResult(BuyerMatch.meta, { matches: [], refusedCriteria: [c.demographic] }, {
        confidence: 0.95, riskClass: "regulated", autonomyLevel: "A4", requiresHumanApproval: true,
        rationale: "Demographic-coded criteria refused + logged (HR-02/HR-04 steering guardrail).",
        unresolvedConflicts: [`refused demographic criterion: ${c.demographic}`],
      });
    }
    const matches = input.listings
      .filter((l) => (c.minBeds === undefined || l.beds >= c.minBeds) && (c.maxPrice === undefined || l.price <= c.maxPrice))
      .map((l) => {
        const reasons: string[] = [];
        let score = 50;
        if (c.minBeds !== undefined && l.beds >= c.minBeds) { score += 20; reasons.push(`${l.beds} beds ≥ ${c.minBeds}`); }
        if (c.maxPrice !== undefined && l.price <= c.maxPrice) { score += 15; reasons.push(`$${l.price.toLocaleString()} within budget`); }
        const feats = (c.mustHave ?? []).filter((f) => l.features.some((x) => x.toLowerCase().includes(f.toLowerCase())));
        score += feats.length * 5;
        feats.forEach((f) => reasons.push(`has ${f}`));
        return { listingId: l.id, score: Math.min(100, score), reasons };
      })
      .sort((a, b) => b.score - a.score);
    return agentResult(BuyerMatch.meta, { matches, refusedCriteria: [] }, {
      confidence: 0.8,
      rationale: `${matches.length} listing(s) matched on objective criteria only (no protected-ground filtering).`,
      autonomyLevel: "A1",
    });
  },
};
