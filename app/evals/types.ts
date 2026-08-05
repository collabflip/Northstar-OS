/**
 * Eval harness types (ARCHITECTURE_CONTRACT §Tests — `evals/`).
 *
 * Golden scenarios are deterministic, self-contained checks over the real
 * policy kernel, agents, model gateway and workflow runner (MemoryStore
 * backed — no live DB, no live model, no network). Each scenario returns a
 * structured outcome; `run.ts` aggregates outcomes into `evals/report.md`.
 */

/** Spec §13 evaluation categories (verbatim coverage, one id per category). */
export const EVAL_CATEGORIES = [
  "document_extraction",
  "source_citations",
  "unsupported_property_claims",
  "comparable_relevance",
  "valuation_uncertainty",
  "seller_intent_classification",
  "conversation_quality",
  "bilingual_parity",
  "safe_escalation",
  "casl_decisions",
  "dncl_decisions",
  "privacy_retention",
  "fintrac_routing",
  "fairness_steering",
  "prompt_injection",
  "data_exfiltration",
  "stale_approvals",
  "duplicate_webhooks",
  "outage_recovery",
  "cross_tenant_leakage",
  "latency",
  "token_usage",
  "monetary_cost",
] as const;

export type EvalCategory = (typeof EVAL_CATEGORIES)[number];

export interface ScenarioOutcome {
  pass: boolean;
  /** concise statement of what was expected */
  expected: string;
  /** concise statement of what actually happened */
  actual: string;
  /** optional evidence detail (rule ids, excerpts, measurements) */
  notes?: string;
}

export interface GoldenScenario {
  /** stable id, e.g. "casl-03" — unique within the suite */
  id: string;
  category: EvalCategory;
  /** spec-mapped rule ids where applicable (e.g. ["CASL-03"]) */
  ruleIds?: string[];
  title: string;
  run(): Promise<ScenarioOutcome> | ScenarioOutcome;
}

export interface ScenarioResult extends ScenarioOutcome {
  id: string;
  category: EvalCategory;
  ruleIds: string[];
  title: string;
  durationMs: number;
}

/** One turn in a simulated seller conversation. */
export interface SimTurn {
  speaker: "seller" | "system";
  text: string;
  /** per-turn invariants asserted by the simulator after the agent responds */
  expect?: {
    intent?: string;
    mustEscalate?: boolean;
    mustRefuseDraft?: boolean;
    mustDiscloseAi?: boolean;
    mustGroundInEvidence?: boolean;
    neverContains?: string[];
  };
}

export interface SimConversation {
  id: string;
  title: string;
  /** persona description for the report */
  persona: string;
  contactName: string;
  isSrp?: boolean;
  evidenceCorpus: { id: string; statement: string }[];
  turns: SimTurn[];
}

export interface SimCheckResult {
  conversationId: string;
  turn: number;
  check: string;
  pass: boolean;
  detail: string;
}

export interface SimConversationReport {
  id: string;
  title: string;
  persona: string;
  checks: SimCheckResult[];
  transcript: { speaker: "seller" | "assistant" | "system"; text: string }[];
}

export interface CategorySummary {
  category: EvalCategory | "seller_conversation_simulator";
  total: number;
  passed: number;
  failed: number;
  passRatePct: number;
}

export interface EvalReport {
  generatedAt: string;
  totals: { scenarios: number; passed: number; failed: number; passRatePct: number };
  simulator: { conversations: number; checks: number; passed: number; failed: number };
  categories: CategorySummary[];
  results: ScenarioResult[];
  failures: ScenarioResult[];
  simReports: SimConversationReport[];
  durationMs: number;
}

/** Convenience constructor used throughout golden.ts. */
export function outcome(
  pass: boolean,
  expected: string,
  actual: string,
  notes?: string,
): ScenarioOutcome {
  return { pass, expected, actual, ...(notes ? { notes } : {}) };
}
