import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

/**
 * Deterministic, rules-based offer term extractor over STORED offer document
 * text (truthful: no OCR/LLM here). Every extracted field cites the exact
 * page + section marker ([p.N §X.Y]) it came from.
 */

export const offerTermSchema = z.object({
  field: z.string(),
  value: z.string().nullable(),
  sourcePage: z.number().nullable(),
  sourceSection: z.string().nullable(),
  confidence: z.number().min(0).max(100),
  flag: z.enum(["none", "missing", "contradiction", "unusual"]),
  flagNote: z.string().nullable(),
});
export const extractionResultSchema = z.object({
  terms: z.array(offerTermSchema),
  extractionConfidence: z.number(),
  fieldsNeedingVerification: z.array(z.string()),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export interface ExtractionInput {
  documentText: string;
}

type Term = ExtractionResult["terms"][number];
const MARKER = /^\[p\.(\d+)\s+§([\d.]+)\]\s*(.*)$/;

const FIELD_PATTERNS: { field: string; re: RegExp }[] = [
  { field: "price", re: /purchase price[:\s]*\$?([\d,]+)/i },
  { field: "deposit", re: /^deposit[:\s]*\$?([\d,]+)\s*[-–—]?\s*(.*)$/i },
  { field: "scheduleADeposit", re: /schedule\s*a[^\n]*?deposit[:\s]*\$?([\d,]+)/i },
  { field: "completionDate", re: /completion date[:\s]*([A-Za-z]+ \d{1,2},? \d{4})/i },
  { field: "possession", re: /possession[:\s]*([^\n]+)/i },
  { field: "irrevocability", re: /irrevocable (?:until|to)[:\s]*([^\n]+)/i },
  { field: "conditions", re: /^conditions[:\s]*([^\n]+)/i },
  { field: "saleOfPropertyCondition", re: /sale[- ]of[- ]property condition[:\s]*([^\n]+)/i },
  { field: "inclusions", re: /^inclusions?[:\s]*([^\n]+)/i },
  { field: "exclusions", re: /^exclusions?[:\s]*([^\n]+)/i },
  { field: "rentalItems", re: /rental items?[:\s]*([^\n]+)/i },
  { field: "warranties", re: /^warrant(?:y|ies)[:\s]*([^\n]+)/i },
  { field: "adjustments", re: /^adjustments?[:\s]*([^\n]+)/i },
  { field: "schedules", re: /schedules? attached[:\s]*([^\n]+)/i },
  { field: "escalationClause", re: /escalation clause[:\s]*([^\n]+)/i },
  { field: "witnessSignature", re: /witness signature[:\s]*(.*)$/i },
];

export function parseOfferDocument(documentText: string): Term[] {
  const terms: Term[] = [];
  const push = (t: Partial<Term> & { field: string }) =>
    terms.push({
      value: null, sourcePage: null, sourceSection: null, confidence: 0,
      flag: "none", flagNote: null, ...t,
    });
  for (const rawLine of documentText.split(/\r?\n/)) {
    const m = rawLine.match(MARKER);
    if (!m) continue;
    const [, page, section, content] = m;
    for (const { field, re } of FIELD_PATTERNS) {
      const fm = content.match(re);
      if (!fm) continue;
      if (field === "witnessSignature") {
        const val = (fm[1] ?? "").trim();
        push({
          field: "signatures", value: val || null,
          sourcePage: +page, sourceSection: section, confidence: val ? 95 : 40,
          flag: val ? "none" : "missing",
          flagNote: val ? null : "witness signature missing — requires human verification",
        });
        continue;
      }
      const value = (fm[1] ?? "").trim();
      const extra = field === "deposit" && fm[2] ? ` — ${fm[2].trim()}` : "";
      const flag = field === "escalationClause" ? ("unusual" as const) : ("none" as const);
      push({
        field, value: value + extra,
        sourcePage: +page, sourceSection: section,
        confidence: value ? 95 : 40,
        flag,
        flagNote: flag === "unusual" ? "unusual clause — review enforceability with your licensed agent" : null,
      });
    }
  }
  // contradiction pass: distinct deposit figures (main vs schedule A)
  const deposits = terms.filter((t) => t.field === "deposit" || t.field === "scheduleADeposit");
  const amounts = [...new Set(deposits.map((t) => (t.value ?? "").replace(/[^\d,].*$/, "").trim()))].filter(Boolean);
  if (amounts.length > 1) {
    for (const t of deposits) {
      t.flag = "contradiction";
      t.flagNote = `deposit figures conflict (${amounts.join(" vs ")}) — verify against source pages`;
      t.confidence = Math.min(t.confidence, 50);
    }
  }
  return terms;
}

export const OfferExtraction: AgentDef<ExtractionInput, ExtractionResult> = {
  meta: { name: "OfferExtraction", promptVersion: "offer-extraction@1.0" },
  resultSchema: extractionResultSchema,
  run(input) {
    const terms = parseOfferDocument(input.documentText);
    const flagged = terms.filter((t) => t.flag !== "none");
    const extractionConfidence = terms.length
      ? Math.round(terms.reduce((s, t) => s + t.confidence, 0) / terms.length)
      : 0;
    return agentResult(OfferExtraction.meta, {
      terms, extractionConfidence,
      fieldsNeedingVerification: flagged.map((t) => t.field),
    }, {
      confidence: extractionConfidence / 100,
      unresolvedConflicts: flagged.map((t) => `${t.field}: ${t.flagNote}`),
      rationale: `${terms.length} term(s) extracted with page/section citations; ${flagged.length} flagged for human verification. Northstar never acts on offers.`,
      riskClass: "regulated",
      autonomyLevel: "A4",
      requiresHumanApproval: true,
    });
  },
};
