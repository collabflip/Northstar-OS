/**
 * F6 — DNCL calling hours resolve in the CALLED PARTY's timezone (fallback:
 * tenant timezone; ambiguous → manual review), and voice fails CLOSED when
 * DNCL/consent flags are omitted.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { evaluateAction, type ActionInput, type EvalContext } from "./engine";

// Wed 2026-06-10 13:45Z = 09:45 America/Toronto (within) but 06:45
// America/Vancouver (outside the 9:00 weekday window start).
const NOW = new Date("2026-06-10T13:45:00Z");

function makeStore(contactTimezone?: string | null) {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  store.addContact({
    id: 100, tenantId: 1, firstName: "Van", lastName: "Couver",
    language: "en", kind: "seller", isSrp: false,
    onInternalDnc: false, onDncl: false, stage: "qualified",
    timezone: contactTimezone ?? null,
  });
  return store;
}

const ctx: EvalContext = { tenantId: 1, actorId: 10, now: NOW, brokeragePolicyVersion: "2.3" };

function voiceCall(overrides: Partial<ActionInput> = {}): ActionInput {
  return {
    kind: "call.place",
    payload: {},
    destination: "comms:voice:contact:100",
    idempotencyKey: "call_f6_0001",
    contactId: 100,
    channel: "voice",
    purpose: "transaction",
    ...overrides,
  };
}

describe("F6 DNCL called-party timezone", () => {
  it("boundary hour: within tenant (Toronto) hours but outside called-party (Vancouver) hours → blocked", async () => {
    const store = makeStore("America/Vancouver");
    const d = await evaluateAction(store, ctx, voiceCall({ dnclRegistered: true }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("DNCL-04");
    const check = d.checks.find((c) => c.check === "consent" && !c.ok);
    expect(check?.message).toContain("America/Vancouver");
  });

  it("same moment with no contact timezone falls back to tenant timezone → allowed", async () => {
    const store = makeStore(null);
    const d = await evaluateAction(store, ctx, voiceCall({ dnclRegistered: true }));
    expect(d.verdict).toBe("allow");
  });

  it("ambiguous (invalid IANA) contact timezone → manual review, not a call", async () => {
    const store = makeStore("Mars/Olympus");
    const d = await evaluateAction(store, ctx, voiceCall({ dnclRegistered: true }));
    expect(d.verdict).toBe("escalate");
    expect(d.ruleIds).toContain("DNCL-04");
  });
});

describe("F6 voice fail-closed on omitted flags", () => {
  it("omitted dnclRegistered flag on voice → blocked (fail closed)", async () => {
    const store = makeStore(null);
    const d = await evaluateAction(store, ctx, voiceCall());
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("DNCL-01");
    const check = d.checks.find((c) => c.check === "consent" && !c.ok);
    expect(check?.message).toMatch(/fail closed/i);
  });

  it("explicitly asserted registration flag with all other controls green → allowed", async () => {
    const store = makeStore(null);
    const d = await evaluateAction(store, ctx, voiceCall({ dnclRegistered: true }));
    expect(d.verdict).toBe("allow");
  });

  it("unregistered tenant posture blocks voice even with asserted flags", async () => {
    const store = makeStore(null);
    const tenant = await store.getTenant(1);
    store.addTenant({ ...tenant!, dnclPosture: "unregistered" });
    const d = await evaluateAction(store, ctx, voiceCall({ dnclRegistered: true }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("DNCL-01");
  });
});
