import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import type { ContactRecord } from "../store/types";
import { contactOutsideProductionScope } from "./controls";
import { CHECK_NAMES, evaluateAction, type ActionInput, type EvalContext } from "./engine";

/**
 * COMP-3 / PIPEDA-07 — contact province tagging + fail-closed jurisdiction.
 * A gated action whose subject contact is tagged with a province OUTSIDE the
 * production pack scope (BC/AB/QC in an ON tenant — fixture packs are
 * non-production) must FAIL CLOSED to manual review (escalate), never be
 * silently evaluated under ON rules. Unknown/null province → allow under the
 * tenant pack (documented behavior).
 */

const NOW = new Date("2026-06-10T14:00:00Z"); // Wed 10:00 Toronto
const day = 86400000;

function makeStore(contactProvince?: string | null) {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  // The Store ContactRecord type predates the contacts.province column — the
  // tag rides on the row (cast mirrors the Drizzle row shape).
  store.addContact({
    id: 100, tenantId: 1, firstName: "A", lastName: "Resident",
    email: "a@example.ca", language: "en", kind: "seller", isSrp: false,
    onInternalDnc: false, onDncl: false, stage: "qualified",
    ...(contactProvince !== undefined ? { province: contactProvince } : {}),
  } as ContactRecord);
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
    idempotencyKey: "idem_jurisdiction_01",
    contactId: 100,
    channel: "email",
    purpose: "transaction",
    text: "Just listed: DEMO-ON-PROPERTY-001 — book a consultation!", // CEM signals
    ...overrides,
  };
}

describe("contact_jurisdiction gate check (PIPEDA-07 / COMP-3)", () => {
  it("QC contact in an ON tenant → escalate to manual review, ruleId PIPEDA-07", async () => {
    const store = makeStore("QC");
    const d = await evaluateAction(store, ctx, cem());
    expect(d.verdict).toBe("escalate");
    expect(d.ruleIds).toContain("PIPEDA-07");
    const check = d.checks.find((c) => c.check === "contact_jurisdiction");
    expect(check?.ok).toBe(false);
    expect(check?.verdict).toBe("escalate");
    expect(check?.message).toMatch(/QC.*outside the production pack scope/);
    // every other check still passed — the escalation is solely jurisdictional
    expect(d.checks.filter((c) => !c.ok)).toHaveLength(1);
    // decision is persisted as audit evidence
    const rows = await store.listPolicyDecisions(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("escalate");
    expect(rows[0].ruleIds).toContain("PIPEDA-07");
  });

  it("BC and AB contacts (fixture packs) also fail closed to manual review", async () => {
    for (const [i, prov] of ["BC", "AB"].entries()) {
      const store = makeStore(prov);
      const d = await evaluateAction(store, ctx, cem({ idempotencyKey: `idem_jurisdiction_bc_ab_${i}` }));
      expect(d.verdict).toBe("escalate");
      expect(d.ruleIds).toContain("PIPEDA-07");
    }
  });

  it("ON contact → unaffected (allow, check passes)", async () => {
    const store = makeStore("ON");
    const d = await evaluateAction(store, ctx, cem());
    expect(d.verdict).toBe("allow");
    expect(d.checks.every((c) => c.ok)).toBe(true);
    expect(d.ruleIds).not.toContain("PIPEDA-07");
    expect(new Set(d.checks.map((c) => c.check))).toEqual(new Set(CHECK_NAMES));
  });

  it("null/untagged province → allow under the tenant pack (documented behavior)", async () => {
    const store = makeStore(null);
    const d = await evaluateAction(store, ctx, cem());
    expect(d.verdict).toBe("allow");
    const check = d.checks.find((c) => c.check === "contact_jurisdiction");
    expect(check?.ok).toBe(true);
    expect(check?.message).toMatch(/untagged — tenant pack applies/);
  });

  it("province tag is normalized (lowercase qc still fails closed)", async () => {
    const store = makeStore("qc");
    const d = await evaluateAction(store, ctx, cem());
    expect(d.verdict).toBe("escalate");
    expect(d.ruleIds).toContain("PIPEDA-07");
  });
});

describe("contactOutsideProductionScope control (pure)", () => {
  const scope = ["ON"];
  it("out-of-scope tagged provinces", () => {
    expect(contactOutsideProductionScope("QC", scope)).toBe(true);
    expect(contactOutsideProductionScope("BC", scope)).toBe(true);
    expect(contactOutsideProductionScope("AB", scope)).toBe(true);
  });
  it("in-scope and unknown provinces", () => {
    expect(contactOutsideProductionScope("ON", scope)).toBe(false);
    expect(contactOutsideProductionScope("on", scope)).toBe(false);
    expect(contactOutsideProductionScope(null, scope)).toBe(false);
    expect(contactOutsideProductionScope(undefined, scope)).toBe(false);
    expect(contactOutsideProductionScope("", scope)).toBe(false);
    expect(contactOutsideProductionScope("  ", scope)).toBe(false);
  });
});
