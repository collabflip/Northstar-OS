import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const strategyResultSchema = z.object({
  positioning: z.array(z.string()),
  prepWork: z.array(z.object({ item: z.string(), priority: z.enum(["high", "medium", "low"]) })),
  mediaPlan: z.array(z.string()),
  launchSequence: z.array(z.object({ step: z.number(), action: z.string(), day: z.number() })),
  timelineWeeks: z.number(),
});
export type StrategyResult = z.infer<typeof strategyResultSchema>;
export interface StrategyInput {
  propertyType?: string;
  valuationMid?: number;
  sellerTiming?: string;
  conditionNotes?: string[];
}

export const ListingStrategist: AgentDef<StrategyInput, StrategyResult> = {
  meta: { name: "ListingStrategist", promptVersion: "listing-strategist@1.0" },
  resultSchema: strategyResultSchema,
  run(input) {
    const urgent = (input.sellerTiming ?? "").toLowerCase().match(/asap|urgent|immediately|this month/);
    const weeks = urgent ? 3 : 6;
    const needsWork = (input.conditionNotes ?? []).length > 0;
    return agentResult(ListingStrategist.meta, {
      positioning: [
        `Position as a move-in-ready ${input.propertyType ?? "home"} for the primary school-catchment buyer segment`,
        `Anchor list price near the point estimate $${(input.valuationMid ?? 0).toLocaleString("en-CA")} with an offer-date strategy`,
        "Lead with lot dimensions, parking, and renovation evidence — all verifiable claims",
      ],
      prepWork: [
        { item: "Professional deep clean + declutter", priority: "high" as const },
        ...(needsWork ? [{ item: `Address condition notes: ${(input.conditionNotes ?? []).join("; ")}`, priority: "high" as const }] : []),
        { item: "Confirm survey + gather permits/warranties", priority: "medium" as const },
        { item: "Pre-listing home inspection (optional)", priority: "low" as const },
      ],
      mediaPlan: ["HDR photo set (25–30 frames)", "Floor plan with measurements", "3-min walkthrough video", "Twilight exterior"],
      launchSequence: [
        { step: 1, action: "Coming-soon to brokerage network", day: -5 },
        { step: 2, action: "MLS-mock live + portal publish (A4 approval)", day: 0 },
        { step: 3, action: "Email/SMS campaign to consented audience (A3 approval)", day: 1 },
        { step: 4, action: "Weekend open house with SRP-safe kiosk", day: 3 },
        { step: 5, action: "Offer presentation date", day: 7 },
      ],
      timelineWeeks: weeks,
    }, {
      confidence: 0.75,
      rationale: `Strategy drafted for ${weeks}-week runway; every outward step is approval-gated.`,
      riskClass: "high",
      autonomyLevel: "A4",
      requiresHumanApproval: true,
      proposedAction: { kind: "strategy.approve", payload: { timelineWeeks: weeks }, destination: "pipeline" },
    });
  },
};
