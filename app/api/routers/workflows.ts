import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { requireRoles, scoped } from "../scoped";
import { getStore } from "../store/drizzle";
import type { Store } from "../store/types";
import { resumeWorkflow, replayWorkflow, handleWebhook, WebhookRejectedError } from "../workflows/runner";
import { WORKFLOW_DEFINITIONS } from "../workflows/definitions";
import { drainOutbox } from "../workflows/drainer";
import { MockCommsProvider } from "../integrations/mockComms";
import { appendAudit } from "../audit";

/**
 * SEC-10: who may inject external workflow events. Webhooks resume durable
 * workflows (e.g. approval_granted releases gated sends) — a forged event is
 * a privilege-escalation primitive. We REQUIRE an authenticated caller with a
 * senior registrant role (broker of record / brokerage admin / transaction
 * coordinator). A team_member cannot fire them. (If a machine integration
 * ever needs this path, add a separate HMAC-shared-secret endpoint — do NOT
 * weaken this role gate.)
 */
const WEBHOOK_CALLER_ROLES = ["broker_of_record", "brokerage_admin", "transaction_coordinator"];

/**
 * Workflows router. ALL data access goes through the Store contract (DB-8:
 * every lookup is tenant-scoped at the store layer, not just by router
 * pre-checks). The factory takes a Store so tests can bind MemoryStore —
 * production uses the DrizzleStore singleton.
 */
export function createWorkflowsRouter(store: Store) {
  const defFor = (kind: string) => {
    const def = WORKFLOW_DEFINITIONS[kind as keyof typeof WORKFLOW_DEFINITIONS];
    if (!def) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown workflow kind ${kind}` });
    return def;
  };

  return createRouter({
    list: authedQuery.query(async ({ ctx }) => {
      const scope = await scoped(ctx);
      return store.listWorkflows(scope.tenantId);
    }),

    byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const wf = await store.getWorkflow(scope.tenantId, input.id);
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      const events = await store.listWorkflowEvents(scope.tenantId, wf.id);
      const outbox = await store.listOutboxByKeyPrefix(scope.tenantId, `wf_${wf.id}_`);
      return { workflow: wf, events, outbox };
    }),

    /** Live restart-resume demonstration: replay + resume, assert 0 duplicate sends. */
    simulateRestart: authedQuery
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const scope = await scoped(ctx);
        const wf = await store.getWorkflow(scope.tenantId, input.id);
        if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
        const def = defFor(wf.kind);
        const before = await store.listOutboxByKeyPrefix(scope.tenantId, `wf_${wf.id}_`);
        const sentBefore = before.filter((o) => o.status === "sent").length;
        const comms = new MockCommsProvider();
        const drain1 = await drainOutbox(store, comms, { actorId: scope.userId, tenantId: scope.tenantId });
        const resumed = await resumeWorkflow(store, def, wf.id, scope.tenantId);
        const drain2 = await drainOutbox(store, comms, { actorId: scope.userId, tenantId: scope.tenantId });
        const after = await store.listOutboxByKeyPrefix(scope.tenantId, `wf_${wf.id}_`);
        const sentAfter = after.filter((o) => o.status === "sent").length;
        const audit = await appendAudit(store, {
          tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
          action: "workflow.simulate_restart", subjectType: "workflow", subjectId: wf.id,
          payload: { stepsRun: resumed.stepsRun, effectsEnqueued: resumed.effectsEnqueued },
        });
        return {
          resumedSteps: resumed.stepsRun,
          newEffectsEnqueued: resumed.effectsEnqueued,
          drained: { first: drain1.sent, second: drain2.sent },
          duplicateSends: Math.max(0, sentAfter - sentBefore - drain1.sent - drain2.sent),
          checkpointEvents: (await store.listWorkflowEvents(scope.tenantId, wf.id)).length,
          auditHash: audit.hash,
        };
      }),

    webhook: authedQuery
      .input(z.object({ id: z.number(), eventType: z.string(), payload: z.record(z.string(), z.unknown()).default({}), dedupeKey: z.string().min(4) }))
      .mutation(async ({ ctx, input }) => {
        const scope = await scoped(ctx);
        // SEC-10 (1/3): authenticated senior registrant role required.
        requireRoles(scope, WEBHOOK_CALLER_ROLES);
        const wf = await store.getWorkflow(scope.tenantId, input.id);
        if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
        const def = defFor(wf.kind);
        // SEC-10 (2/3): eventType must be on the definition's allowlist.
        if (!def.waitEventTypes.includes(input.eventType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `eventType "${input.eventType}" is not accepted by workflow kind ${wf.kind}`,
          });
        }
        // Idempotent redelivery: an already-seen dedupeKey is acked without
        // further validation (the approval may have been consumed since —
        // SEC-6 — and that must not turn an ack into an error).
        const replayed = await replayWorkflow(store, scope.tenantId, wf.id, def);
        if (replayed.seenWebhooks.has(input.dedupeKey)) {
          return { duplicate: true, resumed: false, stepsRun: [] };
        }
        // SEC-10 (3/3): approval_granted must reference a REAL approval in
        // this tenant that is decided-approved and not yet consumed (SEC-6).
        if (input.eventType === "approval_granted") {
          const approvalId = Number(input.payload?.approvalId);
          if (!Number.isInteger(approvalId) || approvalId <= 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "approval_granted requires payload.approvalId (integer)" });
          }
          const approval = await store.getApproval(scope.tenantId, approvalId);
          if (!approval) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `approval ${approvalId} not found in this tenant` });
          }
          if (approval.status !== "approved" || approval.usedAt) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `approval ${approvalId} is not a usable granted approval (status ${approval.status}${approval.usedAt ? ", consumed" : ""})`,
            });
          }
        }
        try {
          return await handleWebhook(store, def, wf.id, scope.tenantId, input);
        } catch (err) {
          if (err instanceof WebhookRejectedError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          throw err;
        }
      }),
  });
}

export const workflowsRouter = createWorkflowsRouter(getStore());
