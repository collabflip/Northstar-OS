/**
 * RED-TEAM: races, replay, and audit-chain tamper (live MySQL where noted).
 *
 * SEC-4 (FIXED — regression): approvals.decide read-then-write race — two
 * concurrent decisions on the same pending approval could BOTH pass the
 * status check. decide now uses a conditional UPDATE
 * (… WHERE status='pending', affectedRows=0 → CONFLICT).
 * SEC-5: caller-chosen idempotency keys are not namespaced per action type —
 * key squatting across action types silently swaps/annihilates intents.
 * SEC-6: approvals are never consumed — one approval authorizes unlimited
 * identical launches within its 48h TTL. (Partner fix landed in decide:
 * consumed approvals are rejected and the decision returns binding
 * coordinates; drainer-side consumption is tracked separately.)
 * SEC-7 (FIXED — regression): approvalBindsAction did not bind the action
 * KIND (payload+dest only). The canonical hash now covers
 * (kind, payload, destination).
 * SEC-8: audit hash chain detects row tampering but NOT tail truncation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";
import { approvalsRouter } from "../routers/approvals";
import { campaignsRouter } from "../routers/campaigns";
import { conversationsRouter } from "../routers/conversations";
import { auditRouter } from "../routers/audit";
import { appendAudit, payloadHash, verifyAuditChain } from "../audit";
import { actionPayloadHash, approvalBindsAction } from "../policy/actionHash";
import { getStore } from "../store/drizzle";
import { drainOutbox } from "../workflows/drainer";
import { MockCommsProvider } from "../integrations/mockComms";

let fx: TwoTenantFixture;

beforeAll(async () => {
  fx = await createTwoTenantFixture("race");
});

afterAll(async () => {
  const db = getDb();
  for (const t of [s.outbox, s.policyDecisions, s.auditLog, s.messages, s.consentRecords, s.suppressionList] as const) {
    await db.delete(t).where(eq(t.tenantId, fx.tenantA));
    await db.delete(t).where(eq(t.tenantId, fx.tenantB));
  }
  await fx?.cleanup();
});

const A = () => ctxFor(fx.userA, fx.tenantA);

async function mkApproval(tag: string, autonomy = "A2") {
  const payload = { tag, n: Math.random() };
  return fx.insert(s.approvals, {
    tenantId: fx.tenantA, kind: "campaign.launch", title: `race ${tag}`,
    payload, payloadHash: payloadHash(payload), destination: "comms:mock",
    requestedBy: "test", autonomyLevel: autonomy,
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  });
}

describe("regression: SEC-4 — approvals.decide double-decide race closed by conditional UPDATE", () => {
  it("sequential double-decide is correctly rejected (baseline)", async () => {
    const id = await mkApproval("seq");
    const hash = payloadHash((await getDb().select().from(s.approvals).where(eq(s.approvals.id, id)))[0].payload);
    await approvalsRouter.createCaller(A()).decide({ id, decision: "approved", expectedPayloadHash: hash });
    await expect(
      approvalsRouter.createCaller(A()).decide({ id, decision: "rejected", expectedPayloadHash: hash, reason: "second" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("CONCURRENT double-decide: 10 rounds of racing decisions — exactly one winner every round", { timeout: 120000 }, async () => {
    // FIXED: decide now commits via a conditional UPDATE
    // (WHERE id AND tenantId AND status='pending'); the loser's write affects
    // 0 rows and is rejected with CONFLICT. Double-decide is impossible.
    let doubleDecided = 0;
    let serializedSafe = 0;
    for (let round = 0; round < 10; round++) {
      const id = await mkApproval(`race-${round}`);
      const hash = payloadHash((await getDb().select().from(s.approvals).where(eq(s.approvals.id, id)))[0].payload);
      const decide = (decision: "approved" | "rejected", reason?: string) =>
        approvalsRouter.createCaller(A()).decide({ id, decision, expectedPayloadHash: hash, reason });
      const results = await Promise.allSettled([
        decide("approved"),
        decide("rejected", "racing reject"),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      if (fulfilled === 2) doubleDecided++;
      else serializedSafe++;
    }
    console.log(`[race] doubleDecided=${doubleDecided}/10 serializedSafe=${serializedSafe}/10`);
    expect(doubleDecided).toBe(0); // conditional UPDATE guarantees a single decider
    expect(serializedSafe).toBe(10);
  });
});

describe("SEC-5 — idempotency key squatting across action types", () => {
  it("attacker squats campaign_launch_send_<id> via cem.send; real launch silently no-ops", async () => {
    const db = getDb();
    // victim campaign in tenant A
    const campaignId = await fx.insert(s.campaigns, {
      tenantId: fx.tenantA, name: "Squat target", status: "draft", autonomyLevel: "A2",
    });
    const squatKey = `campaign_launch_send_${campaignId}`;

    // attacker (same tenant, team_member) needs an allowed cem.send with that key
    const contactId = await fx.insert(s.contacts, {
      tenantId: fx.tenantA, firstName: "C", lastName: "D", kind: "seller",
    });
    await fx.insert(s.consentRecords, {
      tenantId: fx.tenantA, contactId, channel: "email", basis: "express",
      evidenceText: "signed", source: "test", purpose: "transaction", capturedAt: new Date(),
    });
    const convoId = await fx.insert(s.conversations, {
      tenantId: fx.tenantA, contactId, channel: "email",
    });
    const send = await conversationsRouter.createCaller(A()).sendMessage({
      conversationId: convoId,
      body: "Your documents are ready for review.", // non-CEM + justification → allow
      idempotencyKey: squatKey,
    });
    expect(send.sent).toBe(true); // squatting row now occupies the key
    const [squatRow] = await db.select().from(s.outbox).where(
      and(eq(s.outbox.tenantId, fx.tenantA), eq(s.outbox.idempotencyKey, squatKey)),
    );
    expect(squatRow.action).toBe("cem.send");

    // legitimate flow: launch → escalate → approve → launch with approvalId
    const first = await campaignsRouter.createCaller(A()).launch({ id: campaignId });
    expect(first.verdict).toBe("escalate");
    const approvalId = (first as { approvalId?: number }).approvalId!;
    const [appr] = await db.select().from(s.approvals).where(eq(s.approvals.id, approvalId));
    await approvalsRouter.createCaller(A()).decide({
      id: approvalId, decision: "approved", expectedPayloadHash: appr.payloadHash,
    });

    const second = await campaignsRouter.createCaller(A()).launch({ id: campaignId, approvalId });
    expect(second.launched).toBe(true);
    // regression (SEC-5 fixed): idempotency scope is (tenant, action, key) —
    // the attacker's cem.send row no longer annihilates the launch intent;
    // BOTH coexist under the same caller-chosen key:
    const rows = await db.select().from(s.outbox).where(
      and(eq(s.outbox.tenantId, fx.tenantA), eq(s.outbox.idempotencyKey, squatKey)),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.action).sort()).toEqual(["campaign.launch", "cem.send"]);
  });
});

describe("regression: SEC-6 — approvals are single-use (consumption enforced)", () => {
  it("a second launch with a CONSUMED approval is blocked at the gate", async () => {
    const campaignId = await fx.insert(s.campaigns, {
      tenantId: fx.tenantA, name: "Replay target", status: "draft", autonomyLevel: "A2",
    });
    const first = await campaignsRouter.createCaller(A()).launch({ id: campaignId });
    const approvalId = (first as { approvalId?: number }).approvalId!;
    const [appr] = await getDb().select().from(s.approvals).where(eq(s.approvals.id, approvalId));
    await approvalsRouter.createCaller(A()).decide({
      id: approvalId, decision: "approved", expectedPayloadHash: appr.payloadHash,
    });
    const l1 = await campaignsRouter.createCaller(A()).launch({ id: campaignId, approvalId });
    expect(l1.launched).toBe(true);

    // Drain: the send intent executes once and consumes the approval.
    const comms = new MockCommsProvider();
    const drained = await drainOutbox(getStore(), comms, { actorId: fx.userA.id, tenantId: fx.tenantA });
    expect(drained.sent).toBeGreaterThanOrEqual(1);
    const [used] = await getDb().select().from(s.approvals).where(eq(s.approvals.id, approvalId));
    expect(used.usedAt).not.toBeNull();

    const sendsAfterDrain = comms.sentLog.length; // includes earlier tests' drained rows in this shared-DB file

    // Replay attempt with the SAME (now consumed) approval → gate blocks.
    const l2 = await campaignsRouter.createCaller(A()).launch({ id: campaignId, approvalId });
    expect(l2.launched).toBe(false);
    expect(l2.verdict).toBe("block");
    expect(JSON.stringify(l2.reasons)).toMatch(/consumed/);
    // no further drain ran and the blocked launch enqueued nothing executable:
    const drainedAgain = await drainOutbox(getStore(), comms, { actorId: fx.userA.id, tenantId: fx.tenantA });
    expect(drainedAgain.sent).toBe(0);
    expect(comms.sentLog).toHaveLength(sendsAfterDrain); // replay produced zero side effects
  }, 30000); // live-DB e2e: launch → drain → rejected replay
});

describe("regression: SEC-7 — approvalBindsAction binds the action KIND", () => {
  it("an approval binds ONLY the (kind, payload, destination) triple it was issued for", () => {
    const payload = { campaignId: 1, audience: null, budgetCapCents: null };
    const approval = {
      payloadHash: actionPayloadHash({ kind: "campaign.launch", payload, destination: "comms:mock" }),
      destination: "comms:mock",
    };
    expect(approvalBindsAction(approval, { kind: "campaign.launch", payload, destination: "comms:mock" })).toBe(true);
    expect(approvalBindsAction(approval, { kind: "fintrac.review", payload, destination: "comms:mock" })).toBe(false); // kind IS bound
    expect(approvalBindsAction(approval, { kind: "campaign.launch", payload, destination: "comms:other" })).toBe(false); // destination in hash too
  });
});

describe("SEC-8 — audit hash chain: tamper detected, tail truncation NOT detected", () => {
  it("modifying a row breaks verification; deleting the tail does not", async () => {
    const store = getStore();
    for (let i = 0; i < 3; i++) {
      await appendAudit(store, {
        tenantId: fx.tenantA, actorId: fx.userA.id, actorRole: "team_member",
        action: `redteam.tamper_${i}`, subjectType: "redteam", subjectId: `tamper-${i}`, payload: { i },
      });
    }
    const allRows = () =>
      getDb().select().from(s.auditLog).where(eq(s.auditLog.tenantId, fx.tenantA));
    let rows = await allRows();
    expect(verifyAuditChain(rows).ok).toBe(true);

    // tamper: flip a payload hash on the last redteam row (chain spans the
    // whole tenant — filtering by subjectType would itself "break" it)
    const mid = rows.filter((r) => r.subjectType === "redteam").sort((a, b) => a.seq - b.seq).at(-1)!;
    await getDb().update(s.auditLog).set({ payloadHash: "sha256:forged" }).where(eq(s.auditLog.id, mid.id));
    rows = await allRows();
    const tampered = verifyAuditChain(rows);
    expect(tampered.ok).toBe(false);
    expect(tampered.brokenAtSeq).toBe(mid.seq);

    // repair the row, then truncate the TAIL (delete the tenant's last entry)
    await getDb().update(s.auditLog).set({ payloadHash: mid.payloadHash }).where(eq(s.auditLog.id, mid.id));
    rows = await allRows();
    const last = rows.sort((a, b) => b.seq - a.seq)[0];
    await getDb().delete(s.auditLog).where(eq(s.auditLog.id, last.id));
    rows = await allRows();
    const truncated = verifyAuditChain(rows);
    expect(truncated.ok).toBe(true); // tail deletion is INVISIBLE to the chain
    // router endpoint agrees
    const viaApi = await auditRouter.createCaller(A()).verifyChain();
    expect(viaApi.ok).toBe(true);
  });
});
