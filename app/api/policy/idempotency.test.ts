/**
 * SEC-5 — idempotency dedupe scope is (tenantId, actionType, idempotencyKey).
 * A cem.send row carrying a campaign-launch-shaped key no longer squats the
 * approved launch intent; the same (tenant, action, key) still dedupes.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { evaluateAction } from "./engine";

const NOW = new Date("2026-06-10T14:00:00Z");
const KEY = "campaign_launch_send_9";

function makeStore() {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  return store;
}

const ctx = { tenantId: 1, actorId: 10, now: NOW, brokeragePolicyVersion: "2.3" };

const launchAction = {
  kind: "campaign.launch",
  payload: { campaignId: 9, audience: null, budgetCapCents: 100000 },
  destination: "comms:mock",
  idempotencyKey: KEY,
  campaignId: 9,
};

describe("SEC-5 cross-action idempotency squatting", () => {
  it("a cem.send row with the launch key does NOT block the launch intent at the gate", async () => {
    const store = makeStore();
    // attacker squats the predictable launch key under a DIFFERENT action type
    const squat = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: KEY, action: "cem.send", payload: { body: "hi" } });
    expect(squat.created).toBe(true);

    const d1 = await evaluateAction(store, ctx, launchAction);
    expect(d1.checks.find((c) => c.check === "idempotency")?.ok).toBe(true);

    // even after the squatter row is drained to sent, the launch gate is unaffected
    await store.markOutbox(1, squat.id, { status: "sent", sentAt: NOW });
    const d2 = await evaluateAction(store, ctx, launchAction);
    expect(d2.checks.find((c) => c.check === "idempotency")?.ok).toBe(true);
  });

  it("same (tenant, action, key) still dedupes — enqueue and gate", async () => {
    const store = makeStore();
    const a = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: KEY, action: "campaign.launch", payload: {} });
    const b = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: KEY, action: "campaign.launch", payload: {} });
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);

    await store.markOutbox(1, a.id, { status: "sent", sentAt: NOW });
    const dup = await evaluateAction(store, ctx, launchAction);
    expect(dup.checks.find((c) => c.check === "idempotency")?.ok).toBe(false);
    expect(dup.verdict).toBe("block");
  });

  it("cross-action rows coexist in the outbox (both intents land)", async () => {
    const store = makeStore();
    const cem = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: KEY, action: "cem.send", payload: {} });
    const launch = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: KEY, action: "campaign.launch", payload: {} });
    expect(cem.created).toBe(true);
    expect(launch.created).toBe(true); // the launch intent is NOT swallowed
    expect(launch.id).not.toBe(cem.id);
    expect((await store.getOutboxByKey(1, "cem.send", KEY))?.id).toBe(cem.id);
    expect((await store.getOutboxByKey(1, "campaign.launch", KEY))?.id).toBe(launch.id);
  });
});
