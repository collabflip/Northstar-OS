import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const campaignPlanSchema = z.object({
  name: z.string(),
  channels: z.array(z.string()),
  audienceSize: z.number(),
  budgetCapCents: z.number(),
  frequencyCapPerWeek: z.number(),
  estimatedCostCents: z.number(),
  schedule: z.object({ startDate: z.string(), sendWindow: z.string() }),
  steps: z.array(z.string()),
});
export type CampaignPlan = z.infer<typeof campaignPlanSchema>;
export interface CampaignPlanInput {
  goal: string;
  audienceSize: number;
  channels: ("email" | "sms" | "dm")[];
  budgetCapCents?: number;
  startDate?: string;
}

export const CampaignPlanner: AgentDef<CampaignPlanInput, CampaignPlan> = {
  meta: { name: "CampaignPlanner", promptVersion: "campaign-planner@1.0" },
  resultSchema: campaignPlanSchema,
  run(input) {
    const budgetCapCents = input.budgetCapCents ?? 150_000;
    const estimatedCostCents = input.audienceSize * input.channels.length; // 1¢/msg mock
    const plan: CampaignPlan = {
      name: input.goal,
      channels: input.channels,
      audienceSize: input.audienceSize,
      budgetCapCents,
      frequencyCapPerWeek: 2,
      estimatedCostCents,
      schedule: { startDate: input.startDate ?? new Date().toISOString().slice(0, 10), sendWindow: "10:00-16:00 America/Toronto weekdays" },
      steps: [
        "verify per-contact CASL consent + suppression (pre-send gate per message)",
        "render approved template with sender-ID footer + one-click unsubscribe (CASL-05/06)",
        "enqueue via outbox with idempotency keys; drain through commit-time policy gate",
        "halt automatically at budget/frequency caps",
      ],
    };
    const overBudget = estimatedCostCents > budgetCapCents;
    return agentResult(CampaignPlanner.meta, plan, {
      confidence: 0.8,
      rationale: overBudget
        ? `Estimated cost ${estimatedCostCents}¢ exceeds cap ${budgetCapCents}¢ — plan needs trimming before approval.`
        : "Bounded campaign plan drafted; every message individually policy-gated.",
      unresolvedConflicts: overBudget ? ["estimated cost exceeds budget cap"] : [],
      riskClass: "high",
      autonomyLevel: "A3",
      requiresHumanApproval: true,
      proposedAction: { kind: "campaign.launch", payload: plan, destination: "comms:mock" },
    });
  },
};
