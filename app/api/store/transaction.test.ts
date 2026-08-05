/**
 * DB-5 — multi-write flows are atomic (live DB). A mid-transaction error
 * rolls the whole write set back — no partial rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { DrizzleStore } from "./drizzle";
import { createTwoTenantFixture, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;

beforeAll(async () => {
  fx = await createTwoTenantFixture("db5");
});

afterAll(async () => {
  const db = getDb();
  await db.delete(s.outbox).where(eq(s.outbox.tenantId, fx.tenantA));
  await db.delete(s.policyDecisions).where(eq(s.policyDecisions.tenantId, fx.tenantA));
  await db.delete(s.auditLog).where(eq(s.auditLog.tenantId, fx.tenantA));
  await fx?.cleanup();
});

describe("DB-5 store.transaction atomicity (DrizzleStore, live DB)", () => {
  it("commits the whole write set when the fn succeeds", async () => {
    const store = new DrizzleStore();
    const key = `db5_commit_${Date.now()}`;
    await store.transaction(async (tx) => {
      await tx.recordPolicyDecision({
        tenantId: fx.tenantA, ruleIds: [], action: "probe.commit", actor: "t",
        verdict: "allow", reasons: [],
      });
      await tx.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: key, action: "probe", payload: {} });
    });
    expect(await store.getOutboxByKey(fx.tenantA, "probe", key)).toBeDefined();
    const decisions = await store.listPolicyDecisions(fx.tenantA);
    expect(decisions.some((d) => d.action === "probe.commit")).toBe(true);
  });

  it("a mid-transaction error leaves NO partial rows", async () => {
    const store = new DrizzleStore();
    const key = `db5_rollback_${Date.now()}`;
    await expect(
      store.transaction(async (tx) => {
        await tx.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: key, action: "probe", payload: {} });
        await tx.recordPolicyDecision({
          tenantId: fx.tenantA, ruleIds: [], action: "probe.rollback", actor: "t",
          verdict: "allow", reasons: [],
        });
        throw new Error("forced mid-transaction failure");
      }),
    ).rejects.toThrow("forced mid-transaction failure");
    // both writes rolled back — nothing partial
    expect(await store.getOutboxByKey(fx.tenantA, "probe", key)).toBeUndefined();
    const decisions = await store.listPolicyDecisions(fx.tenantA);
    expect(decisions.some((d) => d.action === "probe.rollback")).toBe(false);
  });

  it("nested transaction() on a tx-bound store reuses the same transaction", async () => {
    const store = new DrizzleStore();
    const key = `db5_nested_${Date.now()}`;
    await expect(
      store.transaction(async (tx) => {
        await tx.transaction(async (inner) => {
          await inner.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: key, action: "probe", payload: {} });
        });
        throw new Error("outer rollback");
      }),
    ).rejects.toThrow("outer rollback");
    expect(await store.getOutboxByKey(fx.tenantA, "probe", key)).toBeUndefined();
  });
});
