import type { Store } from "../store/types";
import type {
  StepEventPayload,
  WorkflowDefinition,
  WorkflowState,
} from "./types";

/**
 * Event-sourced durable workflow runner.
 *
 * - Steps are PURE transition functions (state → state + side-effect intents).
 * - Side effects are ONLY enqueued to the outbox (unique idempotencyKey per
 *   workflow/step/effect index); the drainer sends them through the
 *   commit-time policy gate.
 * - workflow_events is append-only; workflows.state is a rebuildable cache.
 * - resumeWorkflow() replays events to rebuild state, re-enqueues effects
 *   (idempotency keys make this a no-op for already-enqueued rows), then
 *   continues. A crash mid-workflow therefore resumes with ZERO duplicates.
 */

export function effectKey(workflowId: number, step: string, index: number): string {
  return `wf_${workflowId}_${step}_${index}`;
}

interface ReplayedState {
  state: WorkflowState;
  currentStep: string | null;
  status: "running" | "waiting" | "completed" | "failed";
  waitFor?: string;
  seenWebhooks: Set<string>;
}

/** Fold append-only events into current state (deterministic replay). */
export async function replayWorkflow(
  store: Store,
  tenantId: number,
  workflowId: number,
  def: WorkflowDefinition,
): Promise<ReplayedState> {
  const events = await store.listWorkflowEvents(tenantId, workflowId);
  let state: WorkflowState = {};
  let currentStep: string | null = def.initialStep;
  let status: ReplayedState["status"] = "running";
  let waitFor: string | undefined;
  const seenWebhooks = new Set<string>();
  for (const e of events) {
    if (e.type === "workflow_started") {
      state = { input: (e.payload as { input?: Record<string, unknown> }).input ?? {} };
      currentStep = def.initialStep;
    } else if (e.type === "step_completed") {
      const p = e.payload as StepEventPayload;
      state = p.state;
      // a waiting step REMAINS current — it re-runs when its event arrives
      currentStep = p.waitFor ? p.step : p.next;
      waitFor = p.waitFor;
      status = p.next === null ? "completed" : p.waitFor ? "waiting" : "running";
    } else if (e.type === "external_event") {
      const p = e.payload as { eventType: string; payload: unknown; dedupeKey: string };
      seenWebhooks.add(p.dedupeKey);
      state = { ...state, lastEvent: { type: p.eventType, payload: p.payload } };
      if (status === "waiting") status = "running";
    }
  }
  return { state, currentStep, status, waitFor, seenWebhooks };
}

/** Execute steps from currentStep until wait/complete. */
async function runSteps(
  store: Store,
  workflowId: number,
  tenantId: number,
  def: WorkflowDefinition,
  replayed: ReplayedState,
): Promise<{ stepsRun: string[]; effectsEnqueued: number }> {
  const stepsRun: string[] = [];
  let effectsEnqueued = 0;
  let { state, currentStep } = replayed;
  while (currentStep !== null) {
    const step = def.steps[currentStep];
    if (!step) {
      await store.updateWorkflow(tenantId, workflowId, { status: "failed", currentStep });
      throw new Error(`workflow ${def.kind}: unknown step "${currentStep}"`);
    }
    const transition = step(state);
    // side effects ONLY via outbox, idempotent keys
    const keyed = transition.effects.map((effect, i) => ({
      ...effect,
      idempotencyKey: effectKey(workflowId, currentStep!, i),
    }));
    const payload: StepEventPayload = {
      step: currentStep,
      state: transition.state,
      effects: keyed,
      next: transition.next,
      waitFor: transition.waitFor,
    };
    const status = transition.next === null ? "completed" : transition.waitFor ? "waiting" : "running";
    // DB-5: effect enqueues + step event + status cache update are ONE
    // transaction — a crash can no longer split them (closes the DB-6
    // crash window between event append and status update at the DB level).
    await store.transaction(async (tx) => {
      for (const effect of keyed) {
        const { created } = await tx.enqueueOutbox({
          tenantId,
          idempotencyKey: effect.idempotencyKey,
          action: effect.action,
          payload: effect,
        });
        if (created) effectsEnqueued++;
      }
      await tx.appendWorkflowEvent({
        tenantId,
        workflowId,
        type: "step_completed",
        payload,
      });
      await tx.updateWorkflow(tenantId, workflowId, {
        status,
        currentStep: transition.waitFor ? currentStep : transition.next,
        state: transition.state,
      });
    });
    stepsRun.push(currentStep);
    state = transition.state;
    if (transition.waitFor) break;
    currentStep = transition.next;
  }
  return { stepsRun, effectsEnqueued };
}

export async function startWorkflow(
  store: Store,
  def: WorkflowDefinition,
  opts: { tenantId: number; subjectId?: number; input?: Record<string, unknown> },
): Promise<{ workflowId: number; stepsRun: string[]; effectsEnqueued: number }> {
  const workflowId = await store.createWorkflow({
    tenantId: opts.tenantId,
    kind: def.kind,
    subjectId: opts.subjectId ?? null,
    currentStep: def.initialStep,
    state: { input: opts.input ?? {} },
  });
  await store.appendWorkflowEvent({
    tenantId: opts.tenantId,
    workflowId,
    type: "workflow_started",
    payload: { kind: def.kind, input: opts.input ?? {}, subjectId: opts.subjectId ?? null },
  });
  const replayed = await replayWorkflow(store, opts.tenantId, workflowId, def);
  const run = await runSteps(store, workflowId, opts.tenantId, def, replayed);
  return { workflowId, ...run };
}

/**
 * Resume after crash/restart: replay events → re-enqueue any effects whose
 * step events exist but whose outbox rows were lost (dedupe makes this a
 * no-op otherwise) → continue running.
 */
export async function resumeWorkflow(
  store: Store,
  def: WorkflowDefinition,
  workflowId: number,
  tenantId: number,
): Promise<{ stepsRun: string[]; effectsEnqueued: number; status: string }> {
  const replayed = await replayWorkflow(store, tenantId, workflowId, def);
  // re-enqueue effects from completed steps (idempotent — zero duplicates)
  let reEnqueued = 0;
  const events = await store.listWorkflowEvents(tenantId, workflowId);
  for (const e of events) {
    if (e.type !== "step_completed") continue;
    for (const effect of (e.payload as StepEventPayload).effects) {
      const { created } = await store.enqueueOutbox({
        tenantId,
        idempotencyKey: effect.idempotencyKey,
        action: effect.action,
        payload: effect,
      });
      if (created) reEnqueued++;
    }
  }
  if (replayed.status === "completed" || replayed.status === "waiting") {
    return { stepsRun: [], effectsEnqueued: reEnqueued, status: replayed.status };
  }
  const run = await runSteps(store, workflowId, tenantId, def, replayed);
  return { stepsRun: run.stepsRun, effectsEnqueued: reEnqueued + run.effectsEnqueued, status: "running" };
}

/**
 * Webhook entry point with dedupe: a duplicate delivery (same dedupeKey) is
 * acknowledged but never reprocessed.
 */
/** SEC-10: a webhook event the workflow cannot accept was rejected before append. */
export class WebhookRejectedError extends Error {}

export async function handleWebhook(
  store: Store,
  def: WorkflowDefinition,
  workflowId: number,
  tenantId: number,
  event: { eventType: string; payload: unknown; dedupeKey: string },
): Promise<{ duplicate: boolean; resumed: boolean; stepsRun: string[] }> {
  const replayed = await replayWorkflow(store, tenantId, workflowId, def);
  if (replayed.seenWebhooks.has(event.dedupeKey)) {
    return { duplicate: true, resumed: false, stepsRun: [] };
  }
  // SEC-10: a webhook may only deliver the exact event the workflow is
  // CURRENTLY waiting for, and the type must be one the definition ever
  // waits on. Forged/foreign events are rejected BEFORE appending — never
  // recorded as seen, never able to resume a workflow out of band.
  if (!def.waitEventTypes.includes(event.eventType)) {
    throw new WebhookRejectedError(
      `eventType "${event.eventType}" is not an accepted wait-event for workflow kind ${def.kind}`,
    );
  }
  // DB-6: derive "waiting" from the append-only event log (the replayed
  // truth), NOT the workflows.status cache row — a crash between the
  // step_completed event and the status update leaves the cache "running"
  // forever, and reading IT would drop the resume.
  if (replayed.waitFor !== event.eventType) {
    throw new WebhookRejectedError(
      `workflow ${workflowId} (${def.kind}) is not waiting for "${event.eventType}" (waiting for ${replayed.waitFor ?? "nothing"})`,
    );
  }
  await store.appendWorkflowEvent({
    tenantId,
    workflowId,
    type: "external_event",
    payload: event,
  });
  const after = await replayWorkflow(store, tenantId, workflowId, def);
  const run = await runSteps(store, workflowId, tenantId, def, after);
  return { duplicate: false, resumed: true, stepsRun: run.stepsRun };
}
