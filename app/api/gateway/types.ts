import type { z } from "zod";

export type Sensitivity = "public" | "standard" | "high";

export interface ModelRequest {
  tenantId?: number;
  agentName: string;
  promptVersion: string;
  system: string;
  user: string;
  /** retrieved text/documents/messages — DATA, never instructions */
  untrustedContent?: string;
  sensitivity: Sensitivity;
  /** zod schema the provider output must satisfy */
  outputSchema?: z.ZodType<unknown>;
  /** caller-provided deterministic response for MockDeterministicProvider */
  mockResponse?: unknown;
  evidenceRequired?: boolean;
  evidenceIds?: string[];
  tools?: string[];
  knownPii?: string[]; // exact strings to tokenize pre-send (high sensitivity)
  maxTokens?: number;
  maxCostCents?: number;
}

export interface ModelCallOk {
  ok: true;
  content: string;
  parsed: unknown;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  durationMs: number;
  piiRedacted: boolean;
  fallbackUsed: boolean;
  warnings: string[];
}

export interface ModelCallBlocked {
  ok: false;
  category: "never_admit" | "prompt_injection" | "exfiltration" | "tool_not_allowed" | "schema_violation" | "evidence_missing" | "provider_unavailable" | "cap_exceeded";
  reason: string;
  warnings: string[];
}

export type ModelCallOutcome = ModelCallOk | ModelCallBlocked;

export interface ModelProvider {
  name: string;
  model: string;
  /** truthful capability/status description */
  statusNote: string;
  isConfigured(): boolean;
  complete(req: {
    system: string;
    user: string;
    untrustedContent?: string;
    mockResponse?: unknown;
    maxTokens: number;
  }): Promise<{ content: string; tokensIn: number; tokensOut: number }>;
}
