import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const identityResultSchema = z.object({
  canonicalId: z.number().nullable(),
  merges: z.array(z.object({
    duplicateId: z.number(),
    matchedFields: z.array(z.string()),
    confidence: z.number(),
  })),
});
export type IdentityResult = z.infer<typeof identityResultSchema>;
export interface IdentityInput {
  candidates: { id: number; name: string; email?: string | null; phone?: string | null }[];
}

export const ContactIdentityResolver: AgentDef<IdentityInput, IdentityResult> = {
  meta: { name: "ContactIdentityResolver", promptVersion: "identity-resolver@1.0" },
  resultSchema: identityResultSchema,
  run(input) {
    const sorted = [...input.candidates].sort((a, b) => a.id - b.id);
    const canonical = sorted[0] ?? null;
    const merges: IdentityResult["merges"] = [];
    const conflicts: string[] = [];
    if (canonical) {
      for (const c of sorted.slice(1)) {
        const matched: string[] = [];
        if (c.email && canonical.email && c.email.toLowerCase() === canonical.email.toLowerCase()) matched.push("email");
        if (c.phone && canonical.phone && c.phone.replace(/\D/g, "") === canonical.phone.replace(/\D/g, "")) matched.push("phone");
        if (c.name.trim().toLowerCase() === canonical.name.trim().toLowerCase()) matched.push("name");
        if (matched.includes("email") || matched.includes("phone"))
          merges.push({ duplicateId: c.id, matchedFields: matched, confidence: matched.length >= 2 ? 0.98 : 0.9 });
        else if (matched.includes("name"))
          conflicts.push(`name-only match id=${c.id} — not merged without email/phone`);
      }
    }
    return agentResult(ContactIdentityResolver.meta, { canonicalId: canonical?.id ?? null, merges }, {
      confidence: merges.length ? 0.9 : 0.6,
      unresolvedConflicts: conflicts,
      rationale: merges.length ? `${merges.length} duplicate(s) matched on strong identifiers.` : "No strong-identifier duplicates found.",
      riskClass: "medium",
      autonomyLevel: "A2",
      requiresHumanApproval: merges.length > 0,
      proposedAction: merges.length ? { kind: "contact.merge", payload: { canonicalId: canonical!.id, merges } } : null,
    });
  },
};
