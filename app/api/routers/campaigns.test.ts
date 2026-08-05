/**
 * F5 — campaign approve→launch e2e. The gate's escalation persists an
 * approval row carrying the canonical payload hash; approving it lets launch
 * proceed; the drainer sends exactly once.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { campaignsRouter } from "./campaigns";
import { approvalsRouter } from "./approvals";
import { getStore } from "../store/drizzle";
import { drainOutbox } from "../workflows/drainer";
import { MockCommsProvider } from "../integrations/mockComms";
import { actionPayloadHash } from "../policy/actionHash";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;
let campaignId: number;
let approvalId = 0;
let approvalHash = "";

beforeAll(async () => {
  fx = await createTwoTenantFixture("f5");
  campaignId = await fx.insert(s.campaigns, {
    tenantId: fx.tenantA,
    name: "F5 Spring Sellers",
    status: "draft",
    budgetCapCents: 100000,
    autonomyLevel: "A2",
    audience: { segment: "past_clients" },
  });
});

afterAll(async () => {
  const db = getDb();
  await db.delete(s.outbox).where(eq(s.outbox.tenantId, fx.tenantA));
  await db.delete(s.approvals).where(eq(s.approvals.tenantId, fx.tenantA));
  await db.delete(s.policyDecisions).where(eq(s.policyDecisions.tenantId, fx.tenantA));
  await db.delete(s.auditLog).where(eq(s.auditLog.tenantId, fx.tenantA));
  await fx?.cleanup();
});

describe("F5 campaign approve→launch", () => {
  it("escalation persists a decidable approval row with the canonical hash", async () => {
    const caller = campaignsRouter.createCaller(ctxFor(fx.userA));
    const res = await caller.launch({ id: campaignId });
    expect(res.launched).toBe(false);
    expect(res.verdict).toBe("escalate");
    approvalId = (res as { approvalId: number }).approvalId;
    expect(approvalId).toBeGreaterThan(0);

    const [ap] = await getDb().select().from(s.approvals).where(
      and(eq(s.approvals.tenantId, fx.tenantA), eq(s.approvals.id, approvalId)),
    );
    expect(ap.status).toBe("pending");
    expect(ap.kind).toBe("campaign.launch");
    // The persisted hash is the canonical action hash of the stored payload.
    expect(ap.payloadHash).toBe(
      actionPayloadHash({ kind: "campaign.launch", payload: ap.payload, destination: ap.destination }),
    );
    approvalHash = ap.payloadHash;
  });

  it("repeated launch while pending reuses the same approval row", async () => {
    const caller = campaignsRouter.createCaller(ctxFor(fx.userA));
    const res = await caller.launch({ id: campaignId });
    expect(res.verdict).toBe("escalate");
    expect((res as { approvalId: number }).approvalId).toBe(approvalId);
  });

  it("after approving the exact payload, launch is allowed and queues the outbox", async () => {
    const approver = approvalsRouter.createCaller(ctxFor(fx.userA));
    await approver.decide({ id: approvalId, decision: "approved", expectedPayloadHash: approvalHash });

    const caller = campaignsRouter.createCaller(ctxFor(fx.userA));
    const res = await caller.launch({ id: campaignId, approvalId });
    expect(res.launched).toBe(true);

    const rows = await getDb().select().from(s.outbox).where(
      and(eq(s.outbox.tenantId, fx.tenantA), eq(s.outbox.idempotencyKey, `campaign_launch_send_${campaignId}`)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("drainer launches exactly once (second drain sends nothing)", async () => {
    const comms = new MockCommsProvider();
    const key = `campaign_launch_send_${campaignId}`;
    const store = getStore();

    const d1 = await drainOutbox(store, comms, { tenantId: fx.tenantA });
    expect(d1.sent).toBe(1);
    expect(comms.sentLog.filter((m) => m.idempotencyKey === key)).toHaveLength(1);

    const d2 = await drainOutbox(store, comms, { tenantId: fx.tenantA });
    expect(d2.sent).toBe(0);
    expect(comms.sentLog.filter((m) => m.idempotencyKey === key)).toHaveLength(1);

    const [row] = await getDb().select().from(s.outbox).where(
      and(eq(s.outbox.tenantId, fx.tenantA), eq(s.outbox.idempotencyKey, key)),
    );
    expect(row.status).toBe("sent");
  });
});
