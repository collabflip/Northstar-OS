import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const marketResultSchema = z.object({
  area: z.string(),
  medianPrice: z.number(),
  domMedian: z.number(),
  monthsInventory: z.number(),
  trend: z.enum(["up", "flat", "down"]),
  narrative: z.string(),
  citations: z.array(z.string()),
});
export type MarketResult = z.infer<typeof marketResultSchema>;
export interface MarketInput {
  area: string;
  series: { date: string; medianPrice: number; dom: number; monthsInventory: number }[];
  sourceRefs: string[];
}

export const MarketIntelligence: AgentDef<MarketInput, MarketResult> = {
  meta: { name: "MarketIntelligence", promptVersion: "market-intelligence@1.0" },
  resultSchema: marketResultSchema,
  run(input) {
    const s = [...input.series].sort((a, b) => a.date.localeCompare(b.date));
    const last = s[s.length - 1];
    const first = s[0];
    if (!last || !first) {
      return agentResult(MarketIntelligence.meta, {
        area: input.area, medianPrice: 0, domMedian: 0, monthsInventory: 0,
        trend: "flat", narrative: "No market series available.", citations: [],
      }, { confidence: 0.1, assumptions: ["no market data"], rationale: "Empty series." });
    }
    const delta = (last.medianPrice - first.medianPrice) / first.medianPrice;
    const trend = delta > 0.03 ? "up" : delta < -0.03 ? "down" : "flat";
    const narrative =
      `${input.area} detached median is $${last.medianPrice.toLocaleString("en-CA")} [${input.sourceRefs[0] ?? "board feed"}]. ` +
      `Median days-on-market is ${last.dom} with ${last.monthsInventory} months of inventory [${input.sourceRefs[1] ?? input.sourceRefs[0] ?? "board feed"}]. ` +
      `The 90-day trend is ${trend} (${(delta * 100).toFixed(1)}%).`;
    return agentResult(MarketIntelligence.meta, {
      area: input.area, medianPrice: last.medianPrice, domMedian: last.dom,
      monthsInventory: last.monthsInventory, trend, narrative, citations: input.sourceRefs,
    }, {
      confidence: s.length >= 3 ? 0.8 : 0.55,
      evidenceIds: input.sourceRefs,
      rationale: `Trend ${trend} from ${s.length} datapoints (${(delta * 100).toFixed(1)}% over series).`,
      autonomyLevel: "A1",
    });
  },
};
