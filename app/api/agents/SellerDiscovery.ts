import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const discoveryResultSchema = z.object({
  profile: z.object({
    motivation: z.string().nullable(),
    timing: z.string().nullable(),
    occupancy: z.string().nullable(),
    renovations: z.array(z.string()),
    mortgageContextNote: z.string().nullable(),
  }),
  completeness: z.number().min(0).max(1),
  followUpQuestions: z.array(z.string()),
});
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;
export interface DiscoveryInput {
  answers: Partial<Record<"motivation" | "timing" | "occupancy" | "renovations" | "mortgage", string>>;
}

const SLOTS = ["motivation", "timing", "occupancy", "renovations", "mortgage"] as const;
const QUESTIONS: Record<(typeof SLOTS)[number], string> = {
  motivation: "What's prompting the move — upsizing, downsizing, relocation, estate?",
  timing: "When would you ideally want to be on the market, and when do you need to be moved by?",
  occupancy: "Will the home be owner-occupied, tenanted, or vacant at listing?",
  renovations: "Any renovations or major updates in the last 10 years (kitchen, baths, roof, windows, basement)?",
  mortgage: "Is there a mortgage or secured line of credit on the property we should know about?",
};

export const SellerDiscovery: AgentDef<DiscoveryInput, DiscoveryResult> = {
  meta: { name: "SellerDiscovery", promptVersion: "seller-discovery@1.0" },
  resultSchema: discoveryResultSchema,
  run(input) {
    const a = input.answers;
    const renovations = (a.renovations ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const filled = SLOTS.filter((s) => (a[s] ?? "").toString().trim().length > 0);
    const missing = SLOTS.filter((s) => !filled.includes(s));
    return agentResult(SellerDiscovery.meta, {
      profile: {
        motivation: a.motivation?.trim() || null,
        timing: a.timing?.trim() || null,
        occupancy: a.occupancy?.trim() || null,
        renovations,
        mortgageContextNote: a.mortgage?.trim() || null,
      },
      completeness: filled.length / SLOTS.length,
      followUpQuestions: missing.map((s) => QUESTIONS[s]),
    }, {
      confidence: filled.length / SLOTS.length,
      assumptions: missing.length ? [`${missing.length} discovery slot(s) unanswered`] : [],
      rationale: `${filled.length}/${SLOTS.length} discovery slots captured.`,
      proposedAction: missing.length ? { kind: "seller.request_info", payload: { questions: missing.map((s) => QUESTIONS[s]) }, destination: "seller-portal" } : null,
      requiresHumanApproval: missing.length > 0,
      autonomyLevel: "A1",
    });
  },
};
