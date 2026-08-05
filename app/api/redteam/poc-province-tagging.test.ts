/**
 * REDTEAM PoC — COMP: PIPEDA-07 "province-of-residence tagging on contacts"
 * (docs/compliance-control-matrix.md AREA 3 row PIPEDA-07).
 *
 * Historical PoC, now a REGRESSION test (flipped 2026-08-02/03, fix 516bb81):
 *  (a) POSITIVE CONTROL — the engine fails closed for a non-production QC pack
 *      when jurisdiction is explicit. (honest, working)
 *  (b) FIXED — contacts.province now exists (db/schema.ts) and the Ontario pack
 *      ships a commit-time `contact_jurisdiction` check (api/policy/ontario.ts):
 *      a Quebec resident inside an ON tenant is escalated and flagged PIPEDA-07;
 *      the pack scenario "QC contact treated as PIPEDA-only → escalate" executes.
 *      Untagged contacts are allowed (documented behaviour — tag is optional).
 */
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { evaluateAction, type ActionInput, type EvalContext } from "../policy/engine";
import * as s from "@db/schema";

const NOW = new Date("2026-06-10T14:00:00Z");

function storeWith() {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  store.addContact({
    id: 100, tenantId: 1, firstName: "Quebecois", lastName: "Lead", language: "fr-CA",
    kind: "buyer_lead", isSrp: false, onInternalDnc: false, onDncl: false, stage: "new_lead",
  });
  store.addConsent({
    id: 1, tenantId: 1, contactId: 100, channel: "email", basis: "express",
    evidenceText: "opt-in", source: "web form", purpose: "transaction",
    capturedAt: NOW, status: "active",
  });
  return store;
}

const ctx: EvalContext = { tenantId: 1, actorId: 10, now: NOW, brokeragePolicyVersion: "2.3" };
const cem = (o: Partial<ActionInput>): ActionInput => ({
  kind: "cem.send", payload: {}, destination: "comms:x",
  idempotencyKey: `idem_${Math.random().toString(36).slice(2, 10)}`,
  contactId: 100, channel: "email", purpose: "transaction",
  text: "Just listed — book a consultation!", marketing: true, ...o,
});

describe("PIPEDA-07 province tagging", () => {
  it("POSITIVE: explicit QC jurisdiction fails closed (pack is fixture_not_production)", async () => {
    const d = await evaluateAction(storeWith(), ctx, cem({ jurisdiction: "QC" }));
    expect(d.verdict).toBe("block");
    expect(d.checks.find((c) => c.check === "jurisdiction")?.message).toMatch(/not production/);
  });

  it("regression: contacts schema HAS a province-of-residence column (COMP-3 fixed)", () => {
    // The matrix claim "Province-of-residence tagging on contacts" is now real.
    expect("province" in s.contacts).toBe(true);
    expect(Object.keys(s.contacts)).toContain("province");
  });

  it("regression: a Quebec-tagged contact in an ON tenant FAILS CLOSED to manual review (PIPEDA-07)", async () => {
    const store = new MemoryStore();
    store.addTenant({
      id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
      brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
    });
    store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
    store.addContact({
      id: 100, tenantId: 1, firstName: "Quebecois", lastName: "Lead", language: "fr-CA",
      kind: "buyer_lead", isSrp: false, onInternalDnc: false, onDncl: false, stage: "new_lead",
      province: "QC",
    } as Parameters<MemoryStore["addContact"]>[0]);
    store.addConsent({
      id: 1, tenantId: 1, contactId: 100, channel: "email", basis: "express",
      evidenceText: "opt-in", source: "web form", purpose: "transaction",
      capturedAt: NOW, status: "active",
    });
    const d = await evaluateAction(store, ctx, cem({}));
    expect(d.verdict).toBe("escalate"); // fail closed — never silently ON-rules
    expect(d.ruleIds).toContain("PIPEDA-07");
    expect(d.checks.find((c) => c.check === "contact_jurisdiction")?.ok).toBe(false);
  });

  it("documented: an UNTAGGED contact is evaluated under the tenant pack (allow)", async () => {
    const d = await evaluateAction(storeWith(), ctx, cem({}));
    expect(d.verdict).toBe("allow"); // null province → tenant pack applies (documented)
  });
});
