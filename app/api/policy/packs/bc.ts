import type { PolicyPack } from "../types";
import { POLICY_DISCLAIMER } from "../types";

/**
 * BC fixture stub — schema-valid but explicitly NOT production.
 * Only the Ontario pack (on.ts) is production-reviewed. Any action gated to
 * this jurisdiction fails closed until counsel approves a real BC pack.
 */
export const BC_PACK: PolicyPack = {
  jurisdiction: "BC",
  version: "fixture-0.1",
  effectiveDate: "2026-01-01",
  owner: "unassigned — fixture only",
  status: "fixture_not_production",
  disclaimer:
    POLICY_DISCLAIMER +
    " This pack is a structural fixture, not a reviewed rule set; do not rely on it.",
  rules: [
    {
      ruleId: "BC-FIXTURE-01",
      sourceName: "Placeholder — no rules researched for BC",
      sourceUrl: "https://example.com/fixture-not-a-source",
      jurisdiction: "BC",
      effectiveDate: "2026-01-01",
      owner: "unassigned — fixture only",
      requirement:
        "Fixture rule proving the pack schema. Real BC rules require counsel-reviewed research before any production use.",
      control: {
        id: "fixture-fail-closed",
        description: "Fail closed for all BC-jurisdiction actions until a production pack exists.",
        kind: "pre_send_gate",
        params: { failClosed: true },
      },
      testScenarios: [
        { name: "any action", given: "any BC action while pack is fixture", expect: "block" },
      ],
      escalationPath: "broker of record + counsel",
      confidence: "medium",
      verifyNote: "Entire pack is a fixture; not a legal source.",
    },
  ],
};
