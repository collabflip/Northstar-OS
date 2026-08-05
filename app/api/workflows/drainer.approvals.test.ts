/**
 * SEC-6 — approvals are consumed on use. An approved gated action drains
 * exactly once; a second drain intent referencing the same approval is
 * rejected at the commit-time gate (and the approval lookup never re-binds
 * a consumed approval).
 */
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { MockCommsProvider } from "../integrations/mockComms";
import { evaluateAction } from "../policy/engine";
import { actionPayloadHash } from "../policy/actionHash";
import { drainOutbox } from "./drainer";

const NOW = new Date("2026-06-10T14:00:00Z");

function makeStoreWithApproval() {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  const actionRef = {
    kind: "campaign.launch",
    payload: { campaignId: 9, audience: null, budgetCapCents: 100000 },
    destination: "comms:mock",
  };
  store.addApproval({
    id: 42, tenantId: 1, kind: actionRef.kind, title: "Launch spring campaign",
    payload: actionRef.payload, payloadHash: actionPayloadHash(actionRef),
    destination: actionRef.destination, status: "approved",
    decidedBy: 20, decidedAt: NOW, expiresAt: new Date(NOW.getTime() + 48 * 3600 * 1000),
    autonomyLevel: "A2", requestedBy: "agent", createdAt: NOW,
  });
  const intent = {
    action: actionRef.kind,
    payload: actionRef.payload,
    destination: actionRef.destination,
    requiresApproval: true,
    approvalId: 42,
    actorId: 10,
    autonomyLevel: "A2",
  };
  return { store, intent };
}

describe("SEC-6 approval consumption at the drain gate", () => {
  it("approved → drained once; second drain with the same approval is rejected", async () => {
    const { store, intent } = makeStoreWithApproval();
    const comms = new MockCommsProvider();

    // first gated intent drains and consumes the approval
    const k1 = `sec6_launch_${Date.now()}_1`;
    await store.enqueueOutbox({ tenantId: 1, idempotencyKey: k1, action: "campaign.launch", payload: intent });
    const first = await drainOutbox(store, comms, { now: NOW, actorId: 10 });
    expect(first.sent).toBe(1);
    expect((await store.getApproval(1, 42))?.usedAt).toEqual(NOW);

    // second intent referencing the SAME approval must not execute
    const k2 = `sec6_launch_${Date.now()}_2`;
    const row2 = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: k2, action: "campaign.launch", payload: intent });
    expect(row2.created).toBe(true);
    const second = await drainOutbox(store, comms, { now: NOW, actorId: 10 });
    expect(second.sent).toBe(0);
    expect(second.blocked).toBe(1);
    expect(comms.sentLog).toHaveLength(1); // side effect fired exactly once
    const outboxRow = await store.getOutboxByKey(1, "campaign.launch", k2);
    expect(outboxRow?.status).toBe("blocked");
    expect(outboxRow?.lastError).toMatch(/consumed/);
  });

  it("the gate rejects a consumed approval even when referenced directly", async () => {
    const { store, intent } = makeStoreWithApproval();
    await store.markApprovalUsed(1, 42, NOW);
    const decision = await evaluateAction(
      store,
      { tenantId: 1, actorId: 10, now: NOW, brokeragePolicyVersion: "2.3" },
      {
        kind: intent.action, payload: intent.payload, destination: intent.destination,
        idempotencyKey: `sec6_direct_${Date.now()}`, requiresApproval: true, approvalId: 42,
      },
    );
    expect(decision.verdict).toBe("block");
    expect(decision.checks.find((c) => c.check === "approval_freshness")?.message).toMatch(/consumed/);
  });

  it("findApprovalByPayloadHash never re-binds a consumed approval", async () => {
    const { store } = makeStoreWithApproval();
    const hash = actionPayloadHash({
      kind: "campaign.launch",
      payload: { campaignId: 9, audience: null, budgetCapCents: 100000 },
      destination: "comms:mock",
    });
    expect((await store.findApprovalByPayloadHash(1, "campaign.launch", hash))?.id).toBe(42);
    await store.markApprovalUsed(1, 42, NOW);
    expect(await store.findApprovalByPayloadHash(1, "campaign.launch", hash)).toBeUndefined();
  });
});
