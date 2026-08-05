import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { MemoryStore } from "./memory";
import { DrizzleStore } from "./drizzle";
import { evaluateAction } from "../policy/engine";
import { createTwoTenantFixture, type TwoTenantFixture } from "../testkit/liveDb";

/** Cross-tenant isolation — two tenants, zero leakage at the store + gate layers. */
function twoTenants() {
  const store = new MemoryStore();
  store.addTenant({ id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto", brokeragePolicyVersion: "2.3", autonomyCeiling: "A2" });
  store.addTenant({ id: 2, name: "OtherBrokerage", province: "ON", timezone: "America/Toronto", brokeragePolicyVersion: "2.3", autonomyCeiling: "A2" });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  store.addMembership({ tenantId: 2, userId: 20, role: "team_member" });
  store.addContact({ id: 100, tenantId: 1, firstName: "A", lastName: "One", language: "en", kind: "seller", isSrp: false, onInternalDnc: false, onDncl: false, stage: "qualified" });
  store.addContact({ id: 200, tenantId: 2, firstName: "B", lastName: "Two", language: "en", kind: "seller", isSrp: false, onInternalDnc: false, onDncl: false, stage: "qualified" });
  return store;
}

describe("cross-tenant isolation", () => {
  it("contact lookups never cross tenants", async () => {
    const store = twoTenants();
    expect(await store.getContact(1, 100)).toBeDefined();
    expect(await store.getContact(1, 200)).toBeUndefined();
    expect(await store.getContact(2, 100)).toBeUndefined();
  });

  it("membership lookups are tenant-scoped", async () => {
    const store = twoTenants();
    expect(await store.getMembership(1, 10)).toBeDefined();
    expect(await store.getMembership(1, 20)).toBeUndefined();
    expect(await store.getMembership(2, 20)).toBeDefined();
  });

  it("consents/suppressions are tenant-scoped", async () => {
    const store = twoTenants();
    store.addConsent({ id: 1, tenantId: 2, contactId: 200, channel: "email", basis: "express", evidenceText: "x", source: "y", purpose: "transaction", capturedAt: new Date(), status: "active" });
    store.addSuppression(2, 200, "email");
    expect(await store.latestConsent(1, 200, "email")).toBeUndefined();
    expect(await store.isSuppressed(1, 200, "email")).toBe(false);
    expect(await store.isSuppressed(2, 200, "email")).toBe(true);
  });

  it("approvals are tenant-scoped", async () => {
    const store = twoTenants();
    store.addApproval({ id: 9, tenantId: 2, kind: "content", title: "t", payload: {}, payloadHash: "h", destination: "d", status: "pending", expiresAt: new Date(Date.now() + 86400000), autonomyLevel: "A2", requestedBy: "a", createdAt: new Date() });
    expect(await store.getApproval(1, 9)).toBeUndefined();
    expect(await store.getApproval(2, 9)).toBeDefined();
  });

  it("policy decisions + audit lists are per-tenant", async () => {
    const store = twoTenants();
    await store.recordPolicyDecision({ tenantId: 1, ruleIds: [], action: "x", actor: "u", verdict: "allow", reasons: [] });
    expect(await store.listPolicyDecisions(2)).toHaveLength(0);
    expect(await store.listPolicyDecisions(1)).toHaveLength(1);
  });

  it("gate fails closed when tenant 1 actor acts on tenant 2 contact", async () => {
    const store = twoTenants();
    const d = await evaluateAction(store, { tenantId: 1, actorId: 10, brokeragePolicyVersion: "2.3" }, {
      kind: "cem.send", payload: {}, destination: "comms:email:contact:200",
      idempotencyKey: "idem_xt_001", contactId: 200, channel: "email",
      purpose: "transaction", text: "Just listed!",
    });
    expect(d.verdict).toBe("block");
    expect(d.checks.find((c) => c.check === "consent")?.ok).toBe(false);
  });

  it("outbox idempotency keys are per-tenant (F10: no cross-tenant key squatting)", async () => {
    const store = twoTenants();
    const a = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "shared_key_001", action: "cem.send", payload: {} });
    const b = await store.enqueueOutbox({ tenantId: 2, idempotencyKey: "shared_key_001", action: "cem.send", payload: {} });
    // Same key in a different tenant is accepted — the (tenantId, key) pair is unique.
    expect(b.created).toBe(true);
    expect(b.id).not.toBe(a.id);
    // Same key in the SAME tenant dedupes.
    const dup = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "shared_key_001", action: "cem.send", payload: {} });
    expect(dup.created).toBe(false);
    expect(dup.id).toBe(a.id);
    // Lookups are tenant-scoped.
    expect((await store.getOutboxByKey(2, "cem.send", "shared_key_001"))?.id).toBe(b.id);
    expect((await store.getOutboxByKey(1, "cem.send", "shared_key_001"))?.id).toBe(a.id);
  });
});

/**
 * DB-8 — the same isolation contract bound to the PRODUCTION DrizzleStore
 * against the live DB. Covers the 5 methods that previously ignored tenantId
 * (getWorkflow, listWorkflowEvents, updateWorkflow, markOutbox,
 * appendWorkflowEvent).
 */
describe("cross-tenant isolation — DrizzleStore (live DB)", () => {
  let fx: TwoTenantFixture;
  const store = new DrizzleStore();
  let wfA: number;
  let outboxA: number;

  beforeAll(async () => {
    fx = await createTwoTenantFixture("db8");
    wfA = await store.createWorkflow({ tenantId: fx.tenantA, kind: "db8_probe", state: {} });
    await store.appendWorkflowEvent({ tenantId: fx.tenantA, workflowId: wfA, type: "probe", payload: {} });
    const row = await store.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: `db8_${Date.now()}`, action: "probe", payload: {} });
    outboxA = row.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(s.workflowEvents).where(eq(s.workflowEvents.tenantId, fx.tenantA));
    await db.delete(s.workflows).where(eq(s.workflows.tenantId, fx.tenantA));
    await db.delete(s.outbox).where(eq(s.outbox.tenantId, fx.tenantA));
    await fx?.cleanup();
  });

  it("getWorkflow is tenant-scoped", async () => {
    expect((await store.getWorkflow(fx.tenantA, wfA))?.id).toBe(wfA);
    expect(await store.getWorkflow(fx.tenantB, wfA)).toBeUndefined();
  });

  it("listWorkflowEvents is tenant-scoped", async () => {
    expect(await store.listWorkflowEvents(fx.tenantA, wfA)).toHaveLength(1);
    expect(await store.listWorkflowEvents(fx.tenantB, wfA)).toHaveLength(0);
  });

  it("updateWorkflow cannot touch another tenant's row", async () => {
    await store.updateWorkflow(fx.tenantB, wfA, { status: "failed" });
    expect((await store.getWorkflow(fx.tenantA, wfA))?.status).toBe("running");
    await store.updateWorkflow(fx.tenantA, wfA, { status: "waiting" });
    expect((await store.getWorkflow(fx.tenantA, wfA))?.status).toBe("waiting");
  });

  it("appendWorkflowEvent refuses a foreign-tenant workflow", async () => {
    await expect(
      store.appendWorkflowEvent({ tenantId: fx.tenantB, workflowId: wfA, type: "x", payload: {} }),
    ).rejects.toThrow(/not found in tenant/i);
    expect(await store.listWorkflowEvents(fx.tenantA, wfA)).toHaveLength(1);
  });

  it("markOutbox cannot touch another tenant's row", async () => {
    await store.markOutbox(fx.tenantB, outboxA, { status: "failed", lastError: "cross-tenant attempt" });
    const row = (await store.listPendingOutbox(500)).find((r) => r.id === outboxA);
    expect(row?.status).toBe("pending");
    expect(row?.lastError ?? null).toBeNull();
    await store.markOutbox(fx.tenantA, outboxA, { status: "blocked", lastError: "own tenant ok" });
    const after = (await store.listOutboxByKeyPrefix(fx.tenantA, "db8_"))[0];
    expect(after.status).toBe("blocked");
  });

  it("listWorkflows / listOutboxByKeyPrefix are tenant-scoped", async () => {
    expect((await store.listWorkflows(fx.tenantA)).some((w) => w.id === wfA)).toBe(true);
    expect((await store.listWorkflows(fx.tenantB)).some((w) => w.id === wfA)).toBe(false);
    expect(await store.listOutboxByKeyPrefix(fx.tenantB, "db8_")).toHaveLength(0);
  });
});
