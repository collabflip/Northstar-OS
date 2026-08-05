/**
 * GAP-6 — workflows router coverage (previously 0%). Drives the drain path
 * end-to-end through the REAL router: start seller journey → escalate →
 * approve (fixture) → webhook resumes → drain → side effect exactly once.
 *
 * SEC-10 — forged webhooks are rejected: wrong role, non-allowlisted
 * eventType, and approval_granted referencing a nonexistent/consumed
 * approval all fail before anything is recorded.
 *
 * The router binds a MemoryStore (fast, deterministic); auth scoping uses
 * live-DB fixture users/memberships (scoped() resolves against the DB).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { MemoryStore } from "../store/memory";
import { MockCommsProvider } from "../integrations/mockComms";
import { startWorkflow } from "../workflows/runner";
import { drainOutbox } from "../workflows/drainer";
import { sellerJourneyWorkflow } from "../workflows/definitions";
import { actionPayloadHash } from "../policy/actionHash";
import { createWorkflowsRouter } from "./workflows";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";

const NOW = new Date("2026-06-10T14:00:00Z");

let fx: TwoTenantFixture;
let broker: s.User;
let store: MemoryStore;
let router: ReturnType<typeof createWorkflowsRouter>;
let workflowId: number;
let approvalId: number;

const INPUT = { contactId: 100, initiatedBy: 0 }; // initiatedBy patched in beforeAll
const CAMPAIGN_EFFECT = {
  kind: "campaign.launch" as const,
  payload: { kind: "campaign_draft", stage: "campaign_drafted", input: INPUT },
  destination: "comms:mock",
};

beforeAll(async () => {
  fx = await createTwoTenantFixture("wfrouter");
  INPUT.initiatedBy = fx.userA.id;
  // a broker-of-record user in tenant A (webhook caller role)
  const brokerId = await fx.insert(s.users, { unionId: `test-wfrouter-broker-${Date.now()}`, name: "Test WFRouter Broker" });
  broker = { id: brokerId } as unknown as s.User;
  const db = (await import("../queries/connection")).getDb();
  await db.insert(s.memberships).values({ userId: brokerId, tenantId: fx.tenantA, role: "broker_of_record", isDefault: true });

  // MemoryStore mirrors the live tenant/user ids so scoped() and the gate agree
  store = new MemoryStore();
  store.addTenant({
    id: fx.tenantA, name: "WF Test Brokerage", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: fx.tenantA, userId: fx.userA.id, role: "team_member" });
  store.addMembership({ tenantId: fx.tenantA, userId: brokerId, role: "broker_of_record" });
  store.addContact({
    id: 100, tenantId: fx.tenantA, firstName: "N", lastName: "P", language: "en",
    kind: "seller", isSrp: false, onInternalDnc: false, onDncl: false, stage: "qualified",
  });
  store.addConsent({
    id: 1, tenantId: fx.tenantA, contactId: 100, channel: "email", basis: "express",
    evidenceText: "form", source: "web", purpose: "transaction",
    capturedAt: NOW, status: "active",
  });
  // approval fixture: binds the exact campaign.launch effect the workflow emits
  store.addApproval({
    id: 1, tenantId: fx.tenantA, kind: CAMPAIGN_EFFECT.kind, title: "Approve journey campaign",
    payload: CAMPAIGN_EFFECT.payload, payloadHash: actionPayloadHash(CAMPAIGN_EFFECT),
    destination: CAMPAIGN_EFFECT.destination, status: "approved",
    decidedBy: brokerId, decidedAt: NOW, expiresAt: new Date(NOW.getTime() + 48 * 3600 * 1000),
    autonomyLevel: "A2", requestedBy: "seller-journey-agent", createdAt: NOW,
  });
  approvalId = 1;
  router = createWorkflowsRouter(store);

  const started = await startWorkflow(store, sellerJourneyWorkflow, {
    tenantId: fx.tenantA, subjectId: 100, input: INPUT,
  });
  workflowId = started.workflowId;
});

afterAll(async () => {
  await fx?.cleanup();
});

describe("SEC-10 forged webhooks are rejected", () => {
  it("team_member cannot fire workflow webhooks (role gate)", async () => {
    const caller = router.createCaller(ctxFor(fx.userA));
    await expect(
      caller.webhook({ id: workflowId, eventType: "approval_granted", payload: { approvalId }, dedupeKey: "forge_role_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
    // nothing recorded
    const events = await store.listWorkflowEvents(fx.tenantA, workflowId);
    expect(events.filter((e) => e.type === "external_event")).toHaveLength(0);
  });

  it("non-allowlisted eventType is rejected even for broker_of_record", async () => {
    const caller = router.createCaller(ctxFor(broker));
    await expect(
      caller.webhook({ id: workflowId, eventType: "note_added", payload: {}, dedupeKey: "forge_type_1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });

  it("approval_granted referencing a nonexistent approval is rejected", async () => {
    const caller = router.createCaller(ctxFor(broker));
    await expect(
      caller.webhook({ id: workflowId, eventType: "approval_granted", payload: { approvalId: 999999 }, dedupeKey: "forge_appr_1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    // still waiting — the forged event must not resume the workflow
    expect((await store.getWorkflow(fx.tenantA, workflowId))?.status).toBe("waiting");
  });

  it("a caller from another tenant is rejected before touching the workflow", async () => {
    // fx.userB is a team_member of tenant B — fails the role gate (and could
    // never resolve the tenant-A workflow anyway: getWorkflow is tenant-scoped).
    const caller = router.createCaller(ctxFor(fx.userB));
    await expect(
      caller.webhook({ id: workflowId, eventType: "approval_granted", payload: { approvalId }, dedupeKey: "forge_xt_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
  });
});

describe("GAP-6 drain path end-to-end (MemoryStore through the router)", () => {
  it("escalate → approve fixture → webhook resume → drain → side effect exactly once", async () => {
    const comms = new MockCommsProvider();

    // 1) the workflow escalated (waiting at await_approval); consultation
    //    email drains once as the first side effect
    const d1 = await drainOutbox(store, comms, { now: NOW, actorId: fx.userA.id, tenantId: fx.tenantA });
    expect(d1.sent).toBe(1);

    // 2) broker fires the approval webhook through the router — resumes
    const caller = router.createCaller(ctxFor(broker));
    const res = await caller.webhook({
      id: workflowId, eventType: "approval_granted",
      payload: { approvalId }, dedupeKey: "wh_e2e_approval_1",
    });
    expect(res.resumed).toBe(true);
    expect(res.duplicate).toBe(false);
    expect((await store.getWorkflow(fx.tenantA, workflowId))?.status).toBe("completed");

    // 3) drain: the approved campaign.launch executes exactly once and the
    //    approval is consumed (SEC-6)
    const d2 = await drainOutbox(store, comms, { now: NOW, actorId: fx.userA.id, tenantId: fx.tenantA });
    expect(d2.sent).toBe(1);
    expect(comms.sentLog).toHaveLength(2);
    expect((await store.getApproval(fx.tenantA, approvalId))?.usedAt).toEqual(NOW);

    // 4) a further drain is a no-op — no duplicate side effects
    const d3 = await drainOutbox(store, comms, { now: NOW, actorId: fx.userA.id, tenantId: fx.tenantA });
    expect(d3.sent).toBe(0);
    expect(comms.sentLog).toHaveLength(2);
  });

  it("duplicate webhook delivery is acked without reprocessing", async () => {
    const caller = router.createCaller(ctxFor(broker));
    const dup = await caller.webhook({
      id: workflowId, eventType: "approval_granted",
      payload: { approvalId }, dedupeKey: "wh_e2e_approval_1",
    });
    expect(dup.duplicate).toBe(true);
    expect(dup.resumed).toBe(false);
  });

  it("a second approval_granted with a fresh key is rejected (workflow no longer waiting)", async () => {
    const caller = router.createCaller(ctxFor(broker));
    await expect(
      caller.webhook({ id: workflowId, eventType: "approval_granted", payload: { approvalId }, dedupeKey: "wh_e2e_late_1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });

  it("list + byId are tenant-scoped through the router", async () => {
    const caller = router.createCaller(ctxFor(fx.userA));
    const list = await caller.list();
    expect(list.some((w) => w.id === workflowId)).toBe(true);
    const detail = await caller.byId({ id: workflowId });
    expect(detail.workflow.id).toBe(workflowId);
    expect(detail.events.length).toBeGreaterThan(0);
    expect(detail.outbox.some((o) => o.idempotencyKey.startsWith(`wf_${workflowId}_`))).toBe(true);

    const other = router.createCaller(ctxFor(fx.userB));
    await expect(other.byId({ id: workflowId })).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);
  });
});
