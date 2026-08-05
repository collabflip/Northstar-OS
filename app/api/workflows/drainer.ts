import { evaluateAction } from "../policy/engine";
import { actionPayloadHash } from "../policy/actionHash";
import type { Store, OutboxRecord } from "../store/types";
import type { MockCommsProvider } from "../integrations/mockComms";
import type { SideEffectIntent } from "./types";

export interface DrainResult {
  processed: number;
  sent: number;
  blocked: number;
  escalated: number;
  details: {
    outboxId: number;
    idempotencyKey: string;
    verdict: "allow" | "block" | "escalate";
    policyDecisionId: number;
  }[];
}

/**
 * Outbox drainer — the ONLY path from queued intent to external side effect.
 * Every send passes the commit-time policy gate (evaluateAction) FRESH at
 * drain time; allowed sends go through the MockCommsProvider (status "mock").
 */
export async function drainOutbox(
  store: Store,
  comms: MockCommsProvider,
  opts: {
    now?: Date;
    brokeragePolicyVersion?: string;
    actorId?: number;
    limit?: number;
    /** Restrict draining to one tenant (ops tooling / tests). */
    tenantId?: number;
  } = {},
): Promise<DrainResult> {
  const pending = (await store.listPendingOutbox(opts.limit ?? 100))
    .filter((r) => opts.tenantId === undefined || r.tenantId === opts.tenantId);
  const result: DrainResult = { processed: 0, sent: 0, blocked: 0, escalated: 0, details: [] };

  const processRow = async (row: OutboxRecord) => {
    let effect = row.payload as SideEffectIntent;
    // F5: if the intent needs approval but carries no approvalId, resolve the
    // approval by its canonical binding (tenantId, actionType, payloadHash) —
    // the exact hash the gate and approval creation used.
    if (effect.requiresApproval && effect.approvalId === undefined) {
      const hash = actionPayloadHash({
        kind: row.action,
        payload: effect.payload,
        destination: effect.destination,
      });
      const approval = await store.findApprovalByPayloadHash(row.tenantId, row.action, hash);
      if (approval) {
        effect = { ...effect, approvalId: approval.id };
      }
    }
    const decision = await evaluateAction(
      store,
      {
        tenantId: row.tenantId,
        actorId: effect.actorId ?? opts.actorId ?? 0,
        now: opts.now,
        brokeragePolicyVersion: opts.brokeragePolicyVersion,
      },
      {
        kind: row.action,
        payload: effect.payload,
        destination: effect.destination,
        idempotencyKey: row.idempotencyKey,
        channel: effect.channel,
        contactId: effect.contactId,
        purpose: effect.purpose,
        text: effect.text,
        marketing: effect.marketing,
        campaignId: effect.campaignId,
        budgetCapCents: effect.budgetCapCents,
        frequencyCapPerWeek: effect.frequencyCapPerWeek,
        costCents: effect.costCents,
        requiresApproval: effect.requiresApproval,
        approvalId: effect.approvalId,
        autonomyLevel: effect.autonomyLevel,
        riskClass: effect.riskClass,
        dataDependent: effect.dataDependent,
        dataAsOf: effect.dataAsOf ? new Date(effect.dataAsOf) : undefined,
        agentGenerated: effect.agentGenerated,
        audit: effect.audit,
        transactionalJustification:
          effect.purpose === "transaction"
            ? `transactional client update (purpose=transaction, logged at drain ${(opts.now ?? new Date()).toISOString()})`
            : undefined,
      },
    );
    result.details.push({
      outboxId: row.id,
      idempotencyKey: row.idempotencyKey,
      verdict: decision.verdict,
      policyDecisionId: decision.decisionId,
    });

    if (decision.verdict === "allow") {
      await comms.send({
        channel: effect.channel === "sms" ? "sms" : "email",
        to: effect.destination,
        body: effect.text ?? JSON.stringify(effect.payload),
        idempotencyKey: row.idempotencyKey,
      });
      // DB-5 + SEC-6: execution bookkeeping commits atomically — the outbox
      // row is marked sent AND the approval (if any) is consumed in the same
      // transaction, so an approval can never be both spent and unspent.
      await store.transaction(async (tx) => {
        await tx.markOutbox(row.tenantId, row.id, {
          status: "sent",
          sentAt: opts.now ?? new Date(),
          attempts: row.attempts + 1,
          policyDecisionId: decision.decisionId,
        });
        if (effect.approvalId !== undefined) {
          await tx.markApprovalUsed(row.tenantId, effect.approvalId, opts.now ?? new Date());
        }
      });
      result.sent++;
    } else if (decision.verdict === "block") {
      await store.markOutbox(row.tenantId, row.id, {
        status: "blocked",
        attempts: row.attempts + 1,
        policyDecisionId: decision.decisionId,
        lastError: decision.checks.filter((c) => !c.ok).map((c) => `${c.check}: ${c.message}`).join(" | "),
      });
      result.blocked++;
    } else {
      // escalate → stays pending for human resolution (Approval Inbox)
      await store.markOutbox(row.tenantId, row.id, {
        attempts: row.attempts + 1,
        policyDecisionId: decision.decisionId,
        lastError: "escalated — awaiting human approval",
      });
      result.escalated++;
    }
  };

  // GAP-7/ARCH-7 per-row guard: a single failing row must never abort the
  // drain cycle — the interval worker (api/boot.ts) runs this unattended, so
  // one poison row cannot wedge the whole side-effect pipeline. The failed
  // row stays pending with the error recorded for inspection.
  for (const row of pending) {
    result.processed++;
    try {
      await processRow(row);
    } catch (err) {
      console.error(`[drainer] outbox row ${row.id} (${row.idempotencyKey}) failed — left pending:`, err);
      try {
        await store.markOutbox(row.tenantId, row.id, {
          attempts: row.attempts + 1,
          lastError: `drain error: ${(err as Error).message}`,
        });
      } catch {
        // even the error bookkeeping failed — keep draining the remaining rows
      }
    }
  }
  return result;
}

export type { OutboxRecord };
