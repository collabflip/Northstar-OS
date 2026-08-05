import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const VALUATION_DISCLAIMER =
  "Decision support for a licensed registrant. This is not an appraisal, a guaranteed sale price, or a final pricing opinion.";

export const valuationResultSchema = z.object({
  low: z.number(),
  mid: z.number(),
  high: z.number(),
  confidencePct: z.number().min(0).max(100),
  basis: z.array(z.object({ driver: z.string(), contribution: z.string() })),
  disclaimer: z.string(),
});
export type ValuationResult = z.infer<typeof valuationResultSchema>;
export interface ValuationInput {
  adjustedCompPrices: number[];
  dataCompleteness: number; // 0..1
  marketTrendPct?: number; // e.g. 0.02
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const ValuationSupport: AgentDef<ValuationInput, ValuationResult> = {
  meta: { name: "ValuationSupport", promptVersion: "valuation-support@1.0" },
  resultSchema: valuationResultSchema,
  run(input) {
    const comps = input.adjustedCompPrices.filter((p) => p > 0);
    if (comps.length === 0) {
      return agentResult(ValuationSupport.meta, {
        low: 0, mid: 0, high: 0, confidencePct: 0,
        basis: [{ driver: "no comparables", contribution: "valuation refused — no adjusted comp prices" }],
        disclaimer: VALUATION_DISCLAIMER,
      }, {
        confidence: 0, riskClass: "medium", requiresHumanApproval: true,
        rationale: "No comparables — valuation refused rather than fabricated.",
        unresolvedConflicts: ["no comp data"],
      });
    }
    const mid0 = median(comps);
    const mean = comps.reduce((s, p) => s + p, 0) / comps.length;
    const stdev = Math.sqrt(comps.reduce((s, p) => s + (p - mean) ** 2, 0) / comps.length);
    const dispersion = stdev / mean;
    // base spread 3%, widened by dispersion and missing data / thin comp set
    let spread = 0.03 + dispersion + (1 - input.dataCompleteness) * 0.04 + (comps.length < 3 ? 0.03 : 0);
    spread = Math.min(0.15, spread);
    const trend = input.marketTrendPct ?? 0;
    const mid = Math.round((mid0 * (1 + trend / 2)) / 1000) * 1000;
    const low = Math.round((mid * (1 - spread)) / 1000) * 1000;
    const high = Math.round((mid * (1 + spread)) / 1000) * 1000;
    const confidencePct = Math.round(Math.max(20, Math.min(95,
      95 - dispersion * 200 - (1 - input.dataCompleteness) * 25 - (comps.length < 3 ? 15 : 0))));
    return agentResult(ValuationSupport.meta, {
      low, mid, high, confidencePct,
      basis: [
        { driver: "adjusted comp median", contribution: `$${mid0.toLocaleString("en-CA")} from ${comps.length} comp(s)` },
        { driver: "dispersion", contribution: `±${(spread * 100).toFixed(1)}% (stdev ${(dispersion * 100).toFixed(1)}%)` },
        { driver: "market trend", contribution: `${(trend * 100).toFixed(1)}% applied at half weight` },
        { driver: "data completeness", contribution: `${Math.round(input.dataCompleteness * 100)}%` },
      ],
      disclaimer: VALUATION_DISCLAIMER,
    }, {
      confidence: confidencePct / 100,
      assumptions: [
        "interior condition assumed consistent with comp set",
        "no material latent defects",
        ...(input.dataCompleteness < 0.8 ? ["missing data widened the range"] : []),
      ],
      rationale: `Range $${low.toLocaleString()}–$${high.toLocaleString()} (point $${mid.toLocaleString()}) from adjusted comp median, widened for dispersion/missing data.`,
      riskClass: "high",
      autonomyLevel: "A2",
      requiresHumanApproval: true,
      proposedAction: { kind: "valuation.publish_to_dossier", payload: { low, mid, high, confidencePct }, destination: "dossier" },
    });
  },
};
