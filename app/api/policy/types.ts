import { z } from "zod";

/** Province-policy pack schema (binding for all packs in api/policy/packs/). */

export const policyTestScenarioSchema = z.object({
  name: z.string(),
  given: z.string(),
  expect: z.enum(["allow", "block", "escalate"]),
});

export const policyControlSchema = z.object({
  id: z.string(),
  description: z.string(),
  kind: z.enum([
    "pre_send_gate",
    "classifier",
    "linter",
    "scheduler",
    "registry",
    "routing",
    "record_keeping",
    "access_control",
    "template",
    "telemetry",
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const policyRuleSchema = z.object({
  ruleId: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string().url(),
  jurisdiction: z.string(), // CA (federal) | ON | BC | AB | QC
  effectiveDate: z.string(),
  reviewDate: z.string().optional(),
  owner: z.string(),
  requirement: z.string(),
  control: policyControlSchema,
  testScenarios: z.array(policyTestScenarioSchema).min(1),
  escalationPath: z.string(),
  confidence: z.enum(["high", "moderate-high", "medium"]),
  verifyNote: z.string().optional(),
});

export const policyPackSchema = z.object({
  jurisdiction: z.string(),
  version: z.string(),
  effectiveDate: z.string(),
  reviewDate: z.string().optional(),
  owner: z.string(),
  status: z.enum(["production", "fixture_not_production", "draft"]),
  disclaimer: z.string(),
  rules: z.array(policyRuleSchema).min(1),
});

export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type PolicyPack = z.infer<typeof policyPackSchema>;
export type PolicyTestScenario = z.infer<typeof policyTestScenarioSchema>;

export const POLICY_DISCLAIMER =
  "Software controls reduce risk but do not guarantee legal compliance. " +
  "Brokerage counsel and the broker of record must review and approve this " +
  "rule set and all automated decision logic before deployment.";
