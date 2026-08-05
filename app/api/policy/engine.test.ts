import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import type { ApprovalRecord } from "../store/types";
import {
  CHECK_NAMES,
  evaluateAction,
  type ActionInput,
  type EvalContext,
} from "./engine";

const NOW = new Date("2026-06-10T14:00:00Z"); // Wed 10:00 Toronto
const day = 86400000;

function makeStore() {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  store.addMembership({ tenantId: 1, userId: 11, role: "broker_of_record" });
  store.addMembership({ tenantId: 1, userId: 12, role: "fintrac_officer" });
  store.addContact({
    id: 100, tenantId: 1, firstName: "A", lastName: "Seller",
    email: "a@example.ca", language: "en", kind: "seller", isSrp: false,
    onInternalDnc: false, onDncl: false, stage: "qualified",
  });
  store.addConsent({
    id: 1000, tenantId: 1, contactId: 100, channel: "email", basis: "express",
    evidenceText: "web form opt-in", source: "form v3", purpose: "transaction",
    capturedAt: new Date(NOW.getTime() - 10 * day), status: "active",
  });
  return store;
}

const ctx: EvalContext = { tenantId: 1, actorId: 10, now: NOW, brokeragePolicyVersion: "2.3" };

function cem(overrides: Partial<ActionInput> = {}): ActionInput {
  return {
    kind: "cem.send",
    payload: { body: "hi" },
    destination: "comms:email:contact:100",
    idempotencyKey: "idem_test_0001",
    contactId: 100,
    channel: "email",
    purpose: "transaction",
    text: "Just listed: DEMO-ON-PROPERTY-001 — book a consultation!", // CEM signals
    ...overrides,
  };
}

describe("policy engine — 14 commit-time checks", () => {
  it("allows a fully compliant CEM send; all 14 checks pass; decision persisted", async () => {
    const store = makeStore();
    const d = await evaluateAction(store, ctx, cem());
    expect(d.verdict).toBe("allow");
    expect(d.checks.filter((c) => c.check !== undefined)).toHaveLength(CHECK_NAMES.length);
    expect(d.checks.every((c) => c.ok)).toBe(true);
    expect(new Set(d.checks.map((c) => c.check))).toEqual(new Set(CHECK_NAMES));
    const rows = await store.listPolicyDecisions(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("allow");
    expect(rows[0].idempotencyKey).toBe("idem_test_0001");
  });

  it("1. tenant: unknown tenant fails closed", async () => {
    const store = makeStore();
    const d = await evaluateAction(store, { ...ctx, tenantId: 999 }, cem());
    expect(d.verdict).toBe("block");
    expect(d.checks.find((c) => c.check === "tenant")?.ok).toBe(false);
  });

  it("2. actor: non-member actor fails closed", async () => {
    const store = makeStore();
    const d = await evaluateAction(store, { ...ctx, actorId: 777 }, cem());
    expect(d.verdict).toBe("block");
    expect(d.checks.find((c) => c.check === "actor")?.ok).toBe(false);
  });

  it("3. role: fintrac action denied to registrant; unknown kind fails closed", async () => {
    const store = makeStore();
    const d1 = await evaluateAction(store, ctx, cem({ kind: "fintrac.str_file", contactId: undefined, channel: undefined }));
    expect(d1.verdict).toBe("block");
    expect(d1.ruleIds).toContain("FIN-07");
    const d2 = await evaluateAction(store, ctx, cem({ kind: "made.up.kind" }));
    expect(d2.checks.find((c) => c.check === "role")?.message).toMatch(/unknown action kind/);
    expect(d2.verdict).toBe("block");
    // fintrac_officer may file
    const d3 = await evaluateAction(store, { ...ctx, actorId: 12 }, cem({ kind: "fintrac.str_file", contactId: undefined, channel: undefined, idempotencyKey: "idem_str_0001" }));
    expect(d3.verdict).toBe("allow");
  });

  it("3b. role: FIN-07 anti-tipping-off — broker_of_record cannot bypass fintrac_officer isolation", async () => {
    const store = makeStore();
    const d = await evaluateAction(store, { ...ctx, actorId: 11 }, cem({ kind: "fintrac.str_file", contactId: undefined, channel: undefined }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("FIN-07");
  });

  it("4. jurisdiction: fixture pack (BC) and unknown jurisdiction fail closed", async () => {
    const store = makeStore();
    const d1 = await evaluateAction(store, ctx, cem({ jurisdiction: "BC" }));
    expect(d1.verdict).toBe("block");
    expect(d1.checks.find((c) => c.check === "jurisdiction")?.message).toMatch(/fixture_not_production/);
    const d2 = await evaluateAction(store, ctx, cem({ jurisdiction: "ZZ" }));
    expect(d2.verdict).toBe("block");
  });

  it("5. brokerage policy: version mismatch blocks", async () => {
    const store = makeStore();
    const d = await evaluateAction(store, { ...ctx, brokeragePolicyVersion: "1.0" }, cem());
    expect(d.verdict).toBe("block");
    expect(d.checks.find((c) => c.check === "brokerage_policy")?.ok).toBe(false);
  });

  it("6. consent: CEM with no consent record blocks (CASL-01)", async () => {
    const store = makeStore();
    const d = await evaluateAction(store, ctx, cem({ channel: "sms" }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("CASL-01");
  });

  it("7. suppression: suppressed contact hard-blocked (CASL-06)", async () => {
    const store = makeStore();
    store.addSuppression(1, 100, "email");
    const d = await evaluateAction(store, ctx, cem());
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("CASL-06");
  });

  it("8. purpose: purpose beyond consented purpose blocks (PIPEDA-02)", async () => {
    const store = makeStore();
    const d = await evaluateAction(store, ctx, cem({ purpose: "marketing" }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("PIPEDA-02");
  });

  it("9+11. approval: missing → escalate; stale → block; hash mismatch → block; fresh+bound → allow", async () => {
    const store = makeStore();
    const base = cem({
      kind: "publish.listing_copy", contactId: undefined, channel: undefined, purpose: undefined,
      requiresApproval: true, idempotencyKey: "idem_pub_0001",
    });
    // broker of record actor for A4 publish
    const borCtx = { ...ctx, actorId: 11 };
    const missing = await evaluateAction(store, borCtx, base);
    expect(missing.verdict).toBe("escalate");
    const payload = { headline: "x" };
    const approval: ApprovalRecord = {
      id: 500, tenantId: 1, kind: "content", title: "t", payload,
      payloadHash: "", destination: "comms:email:contact:100", status: "approved",
      decidedBy: 11, decidedAt: new Date(NOW.getTime() - 49 * 3600 * 1000), // stale (>48h TTL)
      expiresAt: new Date(NOW.getTime() + day), autonomyLevel: "A4", requestedBy: "agent",
      createdAt: new Date(NOW.getTime() - 50 * 3600 * 1000),
    };
    // SEC-7: approvals bind the canonical (kind, payload, destination) hash.
    const { actionPayloadHash } = await import("./actionHash");
    approval.payloadHash = actionPayloadHash({ kind: "publish.listing_copy", payload, destination: "comms:email:contact:100" });
    store.addApproval(approval);
    const stale = await evaluateAction(store, borCtx, { ...base, payload, approvalId: 500 });
    expect(stale.verdict).toBe("block");
    expect(stale.checks.find((c) => c.check === "approval_freshness")?.ok).toBe(false);
    approval.decidedAt = new Date(NOW.getTime() - 2 * 3600 * 1000); // fresh
    const mismatch = await evaluateAction(store, borCtx, { ...base, payload: { headline: "EDITED" }, approvalId: 500, idempotencyKey: "idem_pub_0002" });
    expect(mismatch.verdict).toBe("block");
    expect(mismatch.checks.find((c) => c.check === "payload_destination_binding")?.ok).toBe(false);
    const ok = await evaluateAction(store, borCtx, { ...base, payload, approvalId: 500, idempotencyKey: "idem_pub_0003" });
    expect(ok.verdict).toBe("allow");
  });

  it("10. data freshness: stale data blocks; missing timestamp escalates", async () => {
    const store = makeStore();
    const stale = await evaluateAction(store, ctx, cem({
      dataDependent: true, dataAsOf: new Date(NOW.getTime() - 100 * 3600 * 1000), idempotencyKey: "idem_df_1",
    }));
    expect(stale.verdict).toBe("block");
    const missing = await evaluateAction(store, ctx, cem({ dataDependent: true, idempotencyKey: "idem_df_2" }));
    expect(missing.verdict).toBe("escalate");
    const fresh = await evaluateAction(store, ctx, cem({ dataDependent: true, dataAsOf: new Date(NOW.getTime() - 2 * 3600 * 1000), idempotencyKey: "idem_df_3" }));
    expect(fresh.checks.find((c) => c.check === "data_freshness")?.ok).toBe(true);
  });

  it("12. budget/frequency: over-budget blocks; frequency cap blocks", async () => {
    const store = makeStore();
    store.campaignMessages.push({ tenantId: 1, campaignId: 9, contactId: 100, channel: "email", status: "sent", sentAt: new Date(), costCents: 149 });
    const over = await evaluateAction(store, ctx, cem({
      campaignId: 9, budgetCapCents: 150, costCents: 2, idempotencyKey: "idem_bf_1",
    }));
    expect(over.verdict).toBe("block");
    expect(over.ruleIds).toContain("CASL-08");
    store.campaignMessages.push(
      { tenantId: 1, campaignId: 9, contactId: 100, channel: "email", status: "sent", sentAt: new Date() },
      { tenantId: 1, campaignId: 9, contactId: 100, channel: "email", status: "sent", sentAt: new Date() },
    );
    const freq = await evaluateAction(store, ctx, cem({
      campaignId: 9, frequencyCapPerWeek: 2, idempotencyKey: "idem_bf_2",
    }));
    expect(freq.checks.find((c) => c.check === "budget_frequency")?.ok).toBe(false);
  });

  it("13. idempotency: malformed key blocks; already-sent key blocks duplicate", async () => {
    const store = makeStore();
    const bad = await evaluateAction(store, ctx, cem({ idempotencyKey: "x" }));
    expect(bad.verdict).toBe("block");
    await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "idem_dup_key1", action: "cem.send", payload: {} });
    const row = await store.getOutboxByKey(1, "cem.send", "idem_dup_key1");
    await store.markOutbox(1, row!.id, { status: "sent", sentAt: NOW });
    const dup = await evaluateAction(store, ctx, cem({ idempotencyKey: "idem_dup_key1" }));
    expect(dup.verdict).toBe("block");
    expect(dup.checks.find((c) => c.check === "idempotency")?.message).toMatch(/duplicate/);
  });

  it("14. audit fields: agent-generated without versions blocks", async () => {
    const store = makeStore();
    const d = await evaluateAction(store, ctx, cem({ agentGenerated: true }));
    expect(d.verdict).toBe("block");
    expect(d.checks.find((c) => c.check === "audit_fields")?.ok).toBe(false);
    const ok = await evaluateAction(store, ctx, cem({
      agentGenerated: true, audit: { modelVersion: "mock-deterministic-1", promptVersion: "x@1" }, idempotencyKey: "idem_af_2",
    }));
    expect(ok.checks.find((c) => c.check === "audit_fields")?.ok).toBe(true);
  });

  it("fail-closed: cross-tenant contact is unresolved → block", async () => {
    const store = makeStore();
    store.addTenant({ id: 2, name: "Other", province: "ON", timezone: "America/Toronto", brokeragePolicyVersion: "2.3", autonomyCeiling: "A2" });
    store.addContact({
      id: 200, tenantId: 2, firstName: "X", lastName: "Y", language: "en", kind: "seller",
      isSrp: false, onInternalDnc: false, onDncl: false, stage: "qualified",
    });
    const d = await evaluateAction(store, ctx, cem({ contactId: 200 }));
    expect(d.verdict).toBe("block");
  });
});
