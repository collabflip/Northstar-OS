import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const intakeResultSchema = z.object({
  route: z.enum(["seller", "buyer_lead", "srp", "spam", "other"]),
  priority: z.number().min(0).max(100),
  assignedQueue: z.string(),
  reasons: z.array(z.string()),
});
export type IntakeResult = z.infer<typeof intakeResultSchema>;
export interface IntakeInput {
  message: string;
  channel: string;
  source?: string;
}

const SELLER = ["sell", "selling", "valuation", "list my", "my home", "our house", "townhome i own"];
const BUYER = ["buy", "buying", "looking for", "viewing", "showing", "pre-approved", "preapproved"];
const SRP = ["not working with an agent", "unrepresented", "for sale by owner", "fsbo", "no agent"];
const SPAM = ["lottery", "crypto", "wire transfer", "prince", "won a prize"];
const URGENT = ["asap", "immediately", "this week", "urgent", "right away", "already listed"];

export const IntakeRouter: AgentDef<IntakeInput, IntakeResult> = {
  meta: { name: "IntakeRouter", promptVersion: "intake-router@1.0" },
  resultSchema: intakeResultSchema,
  run(input) {
    const text = input.message.toLowerCase();
    const hit = (list: string[]) => list.filter((k) => text.includes(k));
    const spam = hit(SPAM);
    const srp = hit(SRP);
    const seller = hit(SELLER);
    const buyer = hit(BUYER);
    const urgent = hit(URGENT);
    const route = spam.length ? "spam"
      : srp.length ? "srp"
      : seller.length >= buyer.length && seller.length ? "seller"
      : buyer.length ? "buyer_lead" : "other";
    const priority = Math.min(100,
      (route === "seller" ? 50 : route === "buyer_lead" ? 45 : route === "srp" ? 40 : 10)
      + urgent.length * 15 + (input.source === "Referral" ? 10 : 0));
    const assignedQueue = route === "seller" ? "seller-intake"
      : route === "buyer_lead" ? "buyer-leads"
      : route === "srp" ? "srp-restricted" : route === "spam" ? "quarantine" : "general";
    const reasons = [
      ...(seller.length ? [`seller signals: ${seller.join(", ")}`] : []),
      ...(buyer.length ? [`buyer signals: ${buyer.join(", ")}`] : []),
      ...(srp.length ? [`self-represented signals: ${srp.join(", ")}`] : []),
      ...(spam.length ? [`spam signals: ${spam.join(", ")}`] : []),
      ...(urgent.length ? [`urgency: ${urgent.join(", ")}`] : []),
    ];
    return agentResult(IntakeRouter.meta, { route, priority, assignedQueue, reasons }, {
      confidence: route === "other" ? 0.4 : reasons.length ? 0.85 : 0.5,
      riskClass: route === "srp" ? "regulated" : "low",
      autonomyLevel: route === "srp" ? "A2" : "A1",
      requiresHumanApproval: route === "srp",
      rationale: `Routed to ${assignedQueue} (priority ${priority}) from keyword signals.`,
    });
  },
};
