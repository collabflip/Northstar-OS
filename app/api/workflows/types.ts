/** Durable execution types — Temporal-shaped, event-sourced local runner. */

export interface SideEffectIntent {
  action: string; // e.g. "cem.send", "transaction.update_send", "campaign.launch"
  payload: unknown;
  destination: string;
  /** workflow initiator — used as the gate actor for this side effect */
  actorId?: number;
  channel?: "email" | "sms" | "voice" | "dm";
  contactId?: number;
  purpose?: string;
  text?: string;
  marketing?: boolean;
  campaignId?: number;
  budgetCapCents?: number;
  frequencyCapPerWeek?: number;
  costCents?: number;
  requiresApproval?: boolean;
  approvalId?: number;
  autonomyLevel?: "A0" | "A1" | "A2" | "A3" | "A4";
  riskClass?: "low" | "medium" | "high" | "regulated";
  dataDependent?: boolean;
  dataAsOf?: string;
  agentGenerated?: boolean;
  audit?: { modelVersion?: string; promptVersion?: string };
}

export interface StepTransition {
  state: Record<string, unknown>;
  effects: SideEffectIntent[];
  /** next step name, null = workflow complete */
  next: string | null;
  /** event type to wait for before re-running this step */
  waitFor?: string;
}

export type WorkflowState = Record<string, unknown> & {
  input?: Record<string, unknown>;
  lastEvent?: { type: string; payload: unknown };
};

export type StepFn = (state: WorkflowState) => StepTransition;

export interface WorkflowDefinition {
  kind: string;
  initialStep: string;
  steps: Record<string, StepFn>;
  /** SEC-10: allowlist of external event types this workflow may ever wait for. */
  waitEventTypes: readonly string[];
}

export interface StepEventPayload {
  step: string;
  state: WorkflowState;
  effects: (SideEffectIntent & { idempotencyKey: string })[];
  next: string | null;
  waitFor?: string;
}
