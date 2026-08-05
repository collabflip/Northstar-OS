import type { z } from "zod";

/** Agent contract (ARCHITECTURE_CONTRACT §Agent contract — binding). */

export type AutonomyLevel = "A0" | "A1" | "A2" | "A3" | "A4";
export type RiskClass = "low" | "medium" | "high" | "regulated";

export interface AgentResult<T> {
  /** typed per agent (zod schema) */
  result: T;
  /** 0..1 */
  confidence: number;
  evidenceIds: string[];
  assumptions: string[];
  unresolvedConflicts: string[];
  proposedAction: { kind: string; payload: unknown; destination?: string } | null;
  riskClass: RiskClass;
  /** minimum level required for proposedAction */
  autonomyLevel: AutonomyLevel;
  /** true ⇒ routed to Approval Inbox, never executed inline */
  requiresHumanApproval: boolean;
  /** concise decision rationale — NO chain-of-thought */
  rationale: string;
  modelVersion: string;
  promptVersion: string;
}

export const MOCK_MODEL_VERSION = "mock-deterministic-1";

export interface AgentMeta {
  name: string;
  promptVersion: string;
}

export interface AgentDef<I, T> {
  meta: AgentMeta;
  resultSchema: z.ZodType<T>;
  run(input: I): AgentResult<T>;
}

/** Construct a contract-valid AgentResult with deterministic defaults. */
export function agentResult<T>(
  meta: AgentMeta,
  result: T,
  opts: Partial<Omit<AgentResult<T>, "result" | "modelVersion" | "promptVersion">> = {},
): AgentResult<T> {
  return {
    result,
    confidence: opts.confidence ?? 0.8,
    evidenceIds: opts.evidenceIds ?? [],
    assumptions: opts.assumptions ?? [],
    unresolvedConflicts: opts.unresolvedConflicts ?? [],
    proposedAction: opts.proposedAction ?? null,
    riskClass: opts.riskClass ?? "low",
    autonomyLevel: opts.autonomyLevel ?? "A1",
    requiresHumanApproval: opts.requiresHumanApproval ?? false,
    rationale: opts.rationale ?? "",
    modelVersion: MOCK_MODEL_VERSION,
    promptVersion: meta.promptVersion,
  };
}
