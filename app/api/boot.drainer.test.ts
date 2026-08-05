/**
 * ARCH-7 / GAP-7 — the outbox drainer runs in-process on an interval worker
 * (api/boot.ts): enqueued intents drain WITHOUT a manual "simulate restart"
 * call, side effects fire exactly once, DRAINER_INTERVAL_MS=0 disables the
 * worker, and the drainer's per-row guard contains poison rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "./store/memory";
import { MockCommsProvider, type MockSend, type MockSendResult } from "./integrations/mockComms";
import { drainOutbox } from "./workflows/drainer";
import { drainerIntervalMs, runDrainerCycle, startDrainerWorker, type DrainerWorkerDeps } from "./boot";

const NOW = new Date("2026-06-10T14:00:00Z"); // Wed 10:00 Toronto

function makeStore() {
  const store = new MemoryStore();
  for (const tenantId of [1, 2]) {
    store.addTenant({
      id: tenantId, name: `Tenant ${tenantId}`, province: "ON", timezone: "America/Toronto",
      brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
    });
    store.addMembership({ tenantId, userId: 10, role: "team_member" });
    store.addContact({
      id: tenantId * 100, tenantId, firstName: "A", lastName: "Client",
      email: "a@example.ca", language: "en", kind: "seller", isSrp: false,
      onInternalDnc: false, onDncl: false, stage: "qualified",
    });
  }
  return store;
}

function intent(tenantId: number, destination?: string) {
  return {
    action: "cem.send",
    payload: { conversationId: 1, body: "Following up on our conversation" },
    destination: destination ?? `comms:email:contact:${tenantId * 100}`,
    channel: "email",
    contactId: tenantId * 100,
    purpose: "transaction",
    text: "Following up on our conversation", // non-CEM → transactional pass
    actorId: 10,
  };
}

function deps(store: MemoryStore, comms: MockCommsProvider): DrainerWorkerDeps {
  return { store, comms, now: () => NOW };
}

describe("drainerIntervalMs env parsing", () => {
  it("defaults to 30000, honors explicit values, 0 disables, garbage falls back", () => {
    expect(drainerIntervalMs(undefined)).toBe(30000);
    expect(drainerIntervalMs("15000")).toBe(15000);
    expect(drainerIntervalMs("0")).toBe(0);
    expect(drainerIntervalMs("not-a-number")).toBe(30000);
    expect(drainerIntervalMs("-5")).toBe(30000);
  });

  it("startDrainerWorker returns null when disabled (interval 0)", () => {
    const store = makeStore();
    expect(startDrainerWorker(deps(store, new MockCommsProvider()), 0)).toBeNull();
  });
});

describe("interval drainer worker (ARCH-7/GAP-7)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("enqueued intents drain on the interval — no manual simulate call — exactly once per tenant", async () => {
    const store = makeStore();
    const comms = new MockCommsProvider();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "idem_worker_t1", action: "cem.send", payload: intent(1) });
    await store.enqueueOutbox({ tenantId: 2, idempotencyKey: "idem_worker_t2", action: "cem.send", payload: intent(2) });

    const worker = startDrainerWorker(deps(store, comms), 10);
    expect(worker).not.toBeNull();

    // one tick: both tenants drained without any manual drainOutbox call
    await vi.advanceTimersByTimeAsync(10);
    expect(comms.sentLog.map((s) => s.idempotencyKey).sort()).toEqual(["idem_worker_t1", "idem_worker_t2"]);
    expect((await store.getOutboxByKey(1, "cem.send", "idem_worker_t1"))?.status).toBe("sent");
    expect((await store.getOutboxByKey(2, "cem.send", "idem_worker_t2"))?.status).toBe("sent");
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/\[drainer\] cycle: 2 pending row\(s\) across 2 tenant\(s\)/));

    // many more ticks: no pending rows → side effects fired exactly once
    await vi.advanceTimersByTimeAsync(100);
    expect(comms.sentLog).toHaveLength(2);
    expect(debug.mock.calls.filter((c) => /0 pending row/.test(String(c[0]))).length).toBeGreaterThan(0);

    worker!.stop();
    // after stop, further ticks do nothing
    await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "idem_worker_late", action: "cem.send", payload: intent(1) });
    await vi.advanceTimersByTimeAsync(50);
    expect(comms.sentLog).toHaveLength(2);
    expect((await store.getOutboxByKey(1, "cem.send", "idem_worker_late"))?.status).toBe("pending");
  });

  it("runDrainerCycle drains pending rows per tenant (direct invoke)", async () => {
    const store = makeStore();
    const comms = new MockCommsProvider();
    await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "idem_cycle_t1", action: "cem.send", payload: intent(1) });
    await store.enqueueOutbox({ tenantId: 2, idempotencyKey: "idem_cycle_t2", action: "cem.send", payload: intent(2) });
    const results = await runDrainerCycle(deps(store, comms));
    expect(results).toHaveLength(2); // one DrainResult per tenant
    expect(results.every((r) => r.sent === 1)).toBe(true);
    expect(comms.sentLog).toHaveLength(2);
  });
});

describe("drainer per-row guard (GAP-7)", () => {
  class ThrowingComms extends MockCommsProvider {
    override async send(msg: MockSend): Promise<MockSendResult> {
      if (msg.to.includes("poison")) throw new Error("comms down");
      return super.send(msg);
    }
  }

  it("a poison row never aborts the cycle — good rows still drain, poison row left pending with the error", async () => {
    const store = makeStore();
    const comms = new ThrowingComms();
    await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "idem_guard_poison", action: "cem.send", payload: intent(1, "poison:email:contact:100") });
    await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "idem_guard_good", action: "cem.send", payload: intent(1) });

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await drainOutbox(store, comms, { now: NOW, tenantId: 1 }); // resolves — no unhandled rejection

    expect(result.processed).toBe(2);
    expect(result.sent).toBe(1); // good row drained
    expect(comms.sentLog).toHaveLength(1);
    const poison = await store.getOutboxByKey(1, "cem.send", "idem_guard_poison");
    expect(poison?.status).toBe("pending"); // left for retry/inspection
    expect(poison?.attempts).toBe(1);
    expect(poison?.lastError).toMatch(/drain error: comms down/);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/outbox row \d+ \(idem_guard_poison\) failed/), expect.any(Error));

    // next cycle retries the poison row only — the good row is not re-sent
    const second = await drainOutbox(store, comms, { now: NOW, tenantId: 1 });
    expect(second.processed).toBe(1);
    expect(comms.sentLog).toHaveLength(1);
  });
});
