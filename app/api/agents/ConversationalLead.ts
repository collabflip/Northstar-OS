import { z } from "zod";
import { isSrpRestrictedAssistance } from "../policy/controls";
import { agentResult, type AgentDef } from "./types";

export const AI_DISCLOSURE =
  "I'm Northstar's AI assistant working with the Harbourline team — a licensed registrant reviews anything before it's sent, and you can reach a human at any time.";

export const conversationResultSchema = z.object({
  intent: z.enum(["inquiry", "high_intent", "scheduling", "negotiation", "legal", "offer", "complaint", "other"]),
  leadScoreDelta: z.number(),
  draft: z.string().nullable(),
  groundedEvidenceIds: z.array(z.string()),
  aiDisclosure: z.string(),
  escalation: z.object({ topic: z.string(), reason: z.string() }).nullable(),
  blockedReason: z.string().nullable(),
});
export type ConversationResult = z.infer<typeof conversationResultSchema>;
export interface ConversationInput {
  contactName: string;
  isSrp?: boolean;
  inboundMessages: string[];
  evidenceCorpus: { id: string; statement: string }[];
}

const ESCALATION_TOPICS: { topic: string; re: RegExp; reason: string }[] = [
  { topic: "negotiation", re: /flexible|lowest|negotiat|counter|offer (price|deadline)|would they take/i, reason: "negotiation topics require a licensed registrant (A4)" },
  { topic: "legal", re: /lawyer|sue|contract(ual)? terms?|legal(ly)?|clause enforceable/i, reason: "legal questions are never answered by the assistant" },
  { topic: "offer", re: /submit an offer|make an offer|sign the offer/i, reason: "offer handling is human-only (TRESA-08)" },
];
const HIGH_INTENT = [/book/i, /viewing|showing/i, /deadline/i, /pre-?approved/i, /offer/i];

export const ConversationalLead: AgentDef<ConversationInput, ConversationResult> = {
  meta: { name: "ConversationalLead", promptVersion: "conversational-lead@1.0" },
  resultSchema: conversationResultSchema,
  run(input) {
    const last = input.inboundMessages[input.inboundMessages.length - 1] ?? "";
    const esc = ESCALATION_TOPICS.find((t) => t.re.test(last));
    if (esc) {
      return agentResult(ConversationalLead.meta, {
        intent: esc.topic === "negotiation" ? "negotiation" : esc.topic === "legal" ? "legal" : "offer",
        leadScoreDelta: 10, draft: null, groundedEvidenceIds: [], aiDisclosure: AI_DISCLOSURE,
        escalation: { topic: esc.topic, reason: esc.reason }, blockedReason: "AI will not respond in this thread",
      }, {
        confidence: 0.9, riskClass: "high", autonomyLevel: "A4", requiresHumanApproval: true,
        rationale: `Escalated to human — topic: ${esc.topic}.`,
      });
    }
    if (input.isSrp && isSrpRestrictedAssistance(last).restricted) {
      return agentResult(ConversationalLead.meta, {
        intent: "negotiation", leadScoreDelta: 0, draft: null, groundedEvidenceIds: [],
        aiDisclosure: AI_DISCLOSURE,
        escalation: { topic: "srp-advice", reason: "SRP-flagged contact may receive only factual, client-serving info (TRESA-04)" },
        blockedReason: "SRP advice/opinion request declined",
      }, {
        confidence: 0.92, riskClass: "regulated", autonomyLevel: "A4", requiresHumanApproval: true,
        rationale: "SRP boundary enforced — declined advice and escalated.",
      });
    }
    // ground the answer in the evidence corpus by keyword overlap
    const terms = last.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    const hits = input.evidenceCorpus.filter((e) => {
      const s = e.statement.toLowerCase();
      return terms.some((t) => s.includes(t));
    }).slice(0, 3);
    const highIntent = HIGH_INTENT.some((re) => re.test(last));
    if (hits.length === 0) {
      return agentResult(ConversationalLead.meta, {
        intent: highIntent ? "high_intent" : "inquiry",
        leadScoreDelta: highIntent ? 12 : 2,
        draft: null, groundedEvidenceIds: [], aiDisclosure: AI_DISCLOSURE,
        escalation: null,
        blockedReason: "No approved evidence for this question — draft refused (fail closed); ask the seller or mark as unknown.",
      }, {
        confidence: 0.7, riskClass: "medium", autonomyLevel: "A1", requiresHumanApproval: true,
        rationale: "Ungrounded draft refused.",
      });
    }
    const draft = `${AI_DISCLOSURE}\n\n${hits.map((h) => h.statement).join(" ")}`;
    return agentResult(ConversationalLead.meta, {
      intent: highIntent ? "high_intent" : /saturday|book|schedule|visit/i.test(last) ? "scheduling" : "inquiry",
      leadScoreDelta: highIntent ? 15 : 4,
      draft, groundedEvidenceIds: hits.map((h) => h.id), aiDisclosure: AI_DISCLOSURE,
      escalation: null, blockedReason: null,
    }, {
      confidence: 0.85, evidenceIds: hits.map((h) => h.id), riskClass: "medium", autonomyLevel: "A1",
      requiresHumanApproval: true,
      rationale: `Draft grounded in ${hits.length} evidence item(s); A1 draft — nothing sends without human approval.`,
      proposedAction: { kind: "cem.send", payload: { draft }, destination: "conversation" },
    });
  },
};
