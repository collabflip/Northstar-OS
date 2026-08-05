/**
 * REDTEAM PoC — COMP: CASL-04 "hard-cap 1 send per address on referral basis
 * (idempotent counter in engine)" claimed by docs/compliance-control-matrix.md
 * AREA 1 row CASL-04.
 *
 * Proves the claimed control does NOT exist:
 *  (a) the consent schema cannot even represent a referral basis
 *      (consentBasisValues = express | implied | none — db/schema.ts:154);
 *  (b) two CEM sends to the same contact on a referral-sourced consent are
 *      BOTH allowed — no referral send counter exists in the engine.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { evaluateAction, type ActionInput, type EvalContext } from "../policy/engine";
import { consentBasisValues } from "@db/schema";

const NOW = new Date("2026-06-10T14:00:00Z");

function storeWith() {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  store.addContact({
    id: 100, tenantId: 1, firstName: "Referred", lastName: "Lead", language: "en",
    kind: "buyer_lead", isSrp: false, onInternalDnc: false, onDncl: false, stage: "new_lead",
  });
  store.addConsent({
    id: 1, tenantId: 1, contactId: 100, channel: "email", basis: "express",
    evidenceText: "Referral from Past Client — one message naming referrer",
    source: "referral", purpose: "transaction", capturedAt: NOW, status: "active",
  });
  return store;
}

const ctx: EvalContext = { tenantId: 1, actorId: 10, now: NOW, brokeragePolicyVersion: "2.3" };
const cem = (key: string): ActionInput => ({
  kind: "cem.send", payload: { note: "referral outreach naming referrer" }, destination: "comms:email",
  idempotencyKey: key, contactId: 100, channel: "email", purpose: "transaction",
  text: "Just listed — your colleague suggested I reach out. Book a consultation!",
  marketing: true,
});

describe("CASL-04 referral hard-cap", () => {
  it("GAP: 'referral' is not a representable consent basis", () => {
    expect(consentBasisValues).not.toContain("referral");
  });

  it("GAP: second referral-basis send to the same address is NOT blocked (no cap counter)", async () => {
    const store = storeWith();
    const first = await evaluateAction(store, ctx, cem("idem_referral_1"));
    expect(first.verdict).toBe("allow");
    const second = await evaluateAction(store, ctx, cem("idem_referral_2"));
    // CASL s.10(11): ONE message only on referral basis. The claimed
    // "hard-cap 1 send per address (idempotent counter in engine)" is absent.
    expect(second.verdict).toBe("allow");
    expect(second.ruleIds).not.toContain("CASL-04");
  });
});
