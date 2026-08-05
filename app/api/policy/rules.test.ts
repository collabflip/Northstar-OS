import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { evaluateAction, type ActionInput, type EvalContext } from "./engine";
import { callingHours, humanRightsLint } from "./controls";
import { policyPackSchema } from "./types";
import { ON_PACK } from "./packs/on";
import { BC_PACK } from "./packs/bc";
import { AB_PACK } from "./packs/ab";
import { QC_PACK } from "./packs/qc";

/**
 * Decision tests drawn directly from the Ontario pack test scenarios.
 */
const day = 86400000;
const NOW = new Date("2026-06-10T14:00:00Z"); // Wed 10:00 Toronto

function storeWith(contactOverrides: Partial<Parameters<MemoryStore["addContact"]>[0]> = {}) {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  store.addMembership({ tenantId: 1, userId: 12, role: "fintrac_officer" });
  store.addContact({
    id: 100, tenantId: 1, firstName: "A", lastName: "Seller", language: "en",
    kind: "seller", isSrp: false, onInternalDnc: false, onDncl: false,
    stage: "qualified", ...contactOverrides,
  });
  return store;
}

const ctx: EvalContext = { tenantId: 1, actorId: 10, now: NOW, brokeragePolicyVersion: "2.3" };
const base = (o: Partial<ActionInput>): ActionInput => ({
  kind: "cem.send", payload: {}, destination: "comms:x", idempotencyKey: `idem_${Math.random().toString(36).slice(2, 10)}`,
  contactId: 100, channel: "email", purpose: "transaction",
  text: "Just listed — book a consultation!", ...o,
});

describe("Ontario pack integrity", () => {
  it("ON pack parses against the schema and carries 44 sourced rules", () => {
    expect(() => policyPackSchema.parse(ON_PACK)).not.toThrow();
    expect(ON_PACK.rules.length).toBe(44);
    for (const r of ON_PACK.rules) {
      expect(r.ruleId).toMatch(/^[A-Z]+-\d+$/);
      expect(r.sourceUrl).toMatch(/^https:\/\//);
      expect(r.testScenarios.length).toBeGreaterThan(0);
      expect(r.escalationPath.length).toBeGreaterThan(3);
      expect(r.control.id.length).toBeGreaterThan(2);
    }
  });

  it("fixture packs are schema-valid and marked not-production", () => {
    for (const p of [BC_PACK, AB_PACK, QC_PACK]) {
      expect(() => policyPackSchema.parse(p)).not.toThrow();
      expect(p.status).toBe("fixture_not_production");
    }
  });
});

describe("CASL-03 implied consent expiry", () => {
  it("inquiry 7 months ago → blocked; EBR 14 months → allowed", async () => {
    const store = storeWith();
    store.addConsent({
      id: 1, tenantId: 1, contactId: 100, channel: "email", basis: "implied",
      evidenceText: "inquiry", source: "web", purpose: "transaction",
      capturedAt: new Date(NOW.getTime() - 7 * 30.44 * day),
      expiresAt: new Date(NOW.getTime() - 1 * 30.44 * day), // 6-month inquiry window already closed
      status: "active",
    });
    const d = await evaluateAction(store, ctx, base({}));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("CASL-03");

    const store2 = storeWith();
    store2.addConsent({
      id: 2, tenantId: 1, contactId: 100, channel: "email", basis: "implied",
      evidenceText: "closed purchase 14mo ago", source: "deal file", purpose: "transaction",
      capturedAt: new Date(NOW.getTime() - 14 * 30.44 * day),
      expiresAt: new Date(NOW.getTime() + 10 * 30.44 * day), // within 24-month EBR window
      status: "active",
    });
    const d2 = await evaluateAction(store2, ctx, base({}));
    expect(d2.verdict).toBe("allow");
  });
});

describe("CASL-06 suppression", () => {
  it("suppressed channel is hard-blocked even with express consent", async () => {
    const store = storeWith();
    store.addConsent({
      id: 3, tenantId: 1, contactId: 100, channel: "email", basis: "express",
      evidenceText: "opt-in", source: "form", purpose: "transaction",
      capturedAt: NOW, status: "active",
    });
    store.addSuppression(1, 100, "email");
    const d = await evaluateAction(store, ctx, base({}));
    expect(d.verdict).toBe("block");
    expect(d.checks.find((c) => c.check === "suppression")?.ok).toBe(false);
  });
});

describe("DNCL-04 calling hours (America/Toronto)", () => {
  it("9:45pm weekday blocked; 5:30pm Sunday allowed; 8am Saturday blocked", () => {
    const wed2145 = new Date("2026-06-11T01:45:00Z"); // Wed 21:45 EDT
    expect(callingHours(wed2145).within).toBe(false);
    const sun1730 = new Date("2026-06-14T21:30:00Z"); // Sun 17:30 EDT
    expect(callingHours(sun1730).within).toBe(true);
    const sat0800 = new Date("2026-06-13T12:00:00Z"); // Sat 08:00 EDT
    expect(callingHours(sat0800).within).toBe(false);
    const wed0945 = new Date("2026-06-10T13:45:00Z"); // Wed 09:45 EDT
    expect(callingHours(wed0945).within).toBe(true);
  });

  it("9:45am Toronto = 6:45am in BC → blocked in America/Vancouver", () => {
    const wed0945Toronto = new Date("2026-06-10T13:45:00Z");
    expect(callingHours(wed0945Toronto, "America/Toronto").within).toBe(true);
    expect(callingHours(wed0945Toronto, "America/Vancouver").within).toBe(false);
  });

  it("unknown timezone fails closed (outside window)", () => {
    expect(callingHours(new Date(), "Mars/Olympus").within).toBe(false);
  });
});

describe("DNCL-03 internal do-not-call", () => {
  it("internally DNC-flagged contact blocked from voice", async () => {
    const store = storeWith({ onInternalDnc: true });
    const d = await evaluateAction(store, ctx, base({ kind: "call.place", channel: "voice", text: undefined }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("DNCL-03");
  });
});

describe("DNCL-02 DNCL registry", () => {
  it("DNCL-registered number without EBR exemption blocked; stale scrub blocked", async () => {
    const store = storeWith({ onDncl: true, dnclScrubbedAt: new Date(NOW.getTime() - 5 * day) });
    const d = await evaluateAction(store, ctx, base({ kind: "call.place", channel: "voice", text: undefined }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("DNCL-02");
    const stale = storeWith({ onDncl: true, dnclScrubbedAt: new Date(NOW.getTime() - 45 * day) });
    const d2 = await evaluateAction(stale, ctx, base({ kind: "call.place", channel: "voice", text: undefined }));
    expect(d2.checks.find((c) => !c.ok)?.message).toMatch(/stale/);
  });
});

describe("HR-03 human-rights ad linter", () => {
  it("'not suitable for kids' flagged; clean copy passes", () => {
    const hits = humanRightsLint("Beautiful home, not suitable for kids, great transit");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].ruleIds).toContain("HR-03");
    expect(humanRightsLint("2-bed near transit, pet-friendly")).toHaveLength(0);
  });

  it("gate escalates HR-flagged CEM text for human rewrite", async () => {
    const store = storeWith();
    store.addConsent({
      id: 4, tenantId: 1, contactId: 100, channel: "email", basis: "express",
      evidenceText: "x", source: "y", purpose: "transaction", capturedAt: NOW, status: "active",
    });
    const d = await evaluateAction(store, ctx, base({ text: "Just listed! Not suitable for kids." }));
    expect(d.verdict).toBe("escalate");
    expect(d.ruleIds).toContain("HR-02");
  });
});

describe("TRESA-04 SRP advice block", () => {
  it("SRP-flagged contact + advice-seeking text blocked", async () => {
    const store = storeWith({ isSrp: true });
    store.addConsent({
      id: 5, tenantId: 1, contactId: 100, channel: "email", basis: "express",
      evidenceText: "x", source: "y", purpose: "transaction", capturedAt: NOW, status: "active",
    });
    const d = await evaluateAction(store, ctx, base({ text: "You should offer $950,000 — my advice." }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("TRESA-04");
  });
});

describe("TRESA-08 offer-content disclosure lock", () => {
  const disclose = (payload: Record<string, unknown>, key: string): ActionInput => ({
    kind: "offer.disclose_content", payload,
    destination: "offer-room", idempotencyKey: `idem_oc_${key}`,
  });
  it("caller-asserted direction blocked; persisted artifact allows", async () => {
    const store = storeWith();
    // F8: caller-asserted booleans are ignored — even writtenSellerDirection: true blocks.
    const no = await evaluateAction(store, ctx, disclose({ writtenSellerDirection: true }, "asserted"));
    expect(no.verdict).toBe("block");
    expect(no.ruleIds).toContain("TRESA-08");
    store.addSellerDirectionArtifact({
      id: 55, tenantId: 1, propertyId: 500, signedEvidenceText: "signed direction on file",
      status: "verified", createdAt: NOW,
    });
    const yes = await evaluateAction(store, ctx, disclose({ sellerDirectionArtifactId: 55 }, "artifact"));
    expect(yes.verdict).toBe("allow");
    const revoked = await evaluateAction(store, ctx, disclose({ sellerDirectionArtifactId: 999 }, "missing"));
    expect(revoked.verdict).toBe("block");
  });
});

describe("FIN-07 STR queue role-gating", () => {
  it("STR filing allowed only for fintrac_officer", async () => {
    const store = storeWith();
    const denied = await evaluateAction(store, ctx, base({ kind: "fintrac.str_file", contactId: undefined, channel: undefined }));
    expect(denied.verdict).toBe("block");
    expect(denied.ruleIds).toContain("FIN-07");
    const officer = await evaluateAction(store, { ...ctx, actorId: 12 }, base({ kind: "fintrac.str_file", contactId: undefined, channel: undefined, idempotencyKey: "idem_str_ok" }));
    expect(officer.verdict).toBe("allow");
  });
});

describe("DNCL-07 AI voice", () => {
  it("AI/prerecorded voice solicitation blocked", async () => {
    const store = storeWith();
    const d = await evaluateAction(store, ctx, base({ kind: "call.place", channel: "voice", text: undefined, aiVoice: true }));
    expect(d.verdict).toBe("block");
    expect(d.ruleIds).toContain("DNCL-07");
  });
});
