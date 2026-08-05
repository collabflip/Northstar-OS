import { z } from "zod";
import { adIdentificationLint, claimCrossCheck, humanRightsLint } from "../policy/controls";
import { agentResult, type AgentDef } from "./types";

export const contentResultSchema = z.object({
  headline: z.string(),
  body: z.string(),
  claimsChecked: z.number(),
  unsupportedClaims: z.array(z.string()),
  hrViolations: z.array(z.string()),
  adIdMissing: z.array(z.string()),
  passedAllChecks: z.boolean(),
});
export type ContentResult = z.infer<typeof contentResultSchema>;
export interface ContentInput {
  facts: string[]; // verifiable fact corpus, e.g. ["4 bedrooms", "33 x 122 ft lot"]
  identity: { registeredName: string; category: string; brokerageName: string };
  neighbourhood: string;
  propertyType: string;
}

export const ContentBrand: AgentDef<ContentInput, ContentResult> = {
  meta: { name: "ContentBrand", promptVersion: "content-brand@1.0" },
  resultSchema: contentResultSchema,
  run(input) {
    const facts = input.facts.filter((f) => f.trim().length > 0);
    const headline = `${input.propertyType} in ${input.neighbourhood} — ${facts.slice(0, 2).join(", ") || "well-maintained home"}`;
    const body =
      `${facts.map((f) => `- ${f}`).join("\n")}\n\n` +
      `Listed by ${input.identity.registeredName}, ${input.identity.category}, with ${input.identity.brokerageName}.`;
    const claims = [headline, ...facts];
    const cross = claimCrossCheck(claims, [...facts, input.neighbourhood, input.propertyType]);
    const hr = humanRightsLint(`${headline}\n${body}`);
    const adId = adIdentificationLint(body, input.identity);
    const passed = cross.unsupported.length === 0 && hr.length === 0 && adId.missing.length === 0;
    return agentResult(ContentBrand.meta, {
      headline, body,
      claimsChecked: cross.checked,
      unsupportedClaims: cross.unsupported,
      hrViolations: hr.map((v) => `${v.term} (${v.ground})`),
      adIdMissing: adId.missing,
      passedAllChecks: passed,
    }, {
      confidence: passed ? 0.9 : 0.4,
      evidenceIds: facts.map((_, i) => `fact:${i}`),
      rationale: passed
        ? "Copy passed human-rights linter, claim-vs-data cross-check, and TRESA advertising-identification check."
        : "Copy FAILED lint/cross-check — routed for human rewrite, never published.",
      unresolvedConflicts: cross.unsupported.map((c) => `unsupported claim: ${c}`),
      riskClass: "high",
      autonomyLevel: "A4",
      requiresHumanApproval: true,
      proposedAction: { kind: "publish.listing_copy", payload: { headline, body }, destination: "mls-mock" },
    });
  },
};
