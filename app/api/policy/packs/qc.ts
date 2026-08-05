import type { PolicyPack } from "../types";
import { POLICY_DISCLAIMER } from "../types";

/**
 * QC fixture stub — schema-valid but explicitly NOT production.
 * Only the Ontario pack (on.ts) is production-reviewed. Any action gated to
 * this jurisdiction fails closed until counsel approves a real QC pack.
 */
export const QC_PACK: PolicyPack = {
  jurisdiction: "QC",
  version: "fixture-0.1",
  effectiveDate: "2026-01-01",
  owner: "unassigned — fixture only",
  status: "fixture_not_production",
  disclaimer:
    POLICY_DISCLAIMER +
    " This pack is a structural fixture, not a reviewed rule set; do not rely on it.",
  rules: [
    {
      ruleId: "QC-FIXTURE-01",
      sourceName: "Placeholder — no rules researched for QC",
      sourceUrl: "https://example.com/fixture-not-a-source",
      jurisdiction: "QC",
      effectiveDate: "2026-01-01",
      owner: "unassigned — fixture only",
      requirement:
        "Fixture rule proving the pack schema. Real QC rules require counsel-reviewed research before any production use.",
      control: {
        id: "fixture-fail-closed",
        description: "Fail closed for all QC-jurisdiction actions until a production pack exists.",
        kind: "pre_send_gate",
        params: { failClosed: true },
      },
      testScenarios: [
        { name: "any action", given: "any QC action while pack is fixture", expect: "block" },
      ],
      escalationPath: "broker of record + counsel",
      confidence: "medium",
      verifyNote: "Entire pack is a fixture; not a legal source.",
    },
  ],
};
