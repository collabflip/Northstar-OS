/**
 * DB-7 — audit chain + workflow event seq races under concurrent writers.
 * Read-max-then-insert collides on the unique indexes; bounded duplicate-key
 * retry must land BOTH rows with a verifiable chain and no unhandled error.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "./queries/connection";
import { MemoryStore } from "./store/memory";
import { getStore } from "./store/drizzle";
import { appendAudit, verifyAuditChain } from "./audit";
import { createTwoTenantFixture, type TwoTenantFixture } from "./testkit/liveDb";

describe("DB-7 concurrent appends (MemoryStore)", () => {
  it("2 concurrent appends in one tenant both land; chain verifies", async () => {
    const store = new MemoryStore();
    const [a, b] = await Promise.all([
      appendAudit(store, {
        tenantId: 1, actorRole: "team_member", action: "concurrent.a",
        subjectType: "probe", subjectId: 1, payload: { n: 1 },
      }),
      appendAudit(store, {
        tenantId: 1, actorRole: "team_member", action: "concurrent.b",
        subjectType: "probe", subjectId: 2, payload: { n: 2 },
      }),
    ]);
    expect(a.seq).not.toBe(b.seq);
    const rows = await store.listAudit(1);
    expect(rows).toHaveLength(2);
    expect(verifyAuditChain(rows).ok).toBe(true);
  });

  it("a genuine duplicate (no retry possible) still surfaces the error", async () => {
    const store = new MemoryStore();
    const first = await appendAudit(store, {
      tenantId: 1, action: "seed.row", subjectType: "probe", subjectId: 1, payload: {},
    });
    const { id, createdAt, ...rowAgain } = first;
    void id; // strip id/createdAt so the re-insert collides on the seq unique key
    void createdAt;
    await expect(store.appendAuditRow(rowAgain)).rejects.toThrow(/duplicate entry/i);
  });
});

describe("DB-7 concurrent appends (DrizzleStore, live DB)", () => {
  let fx: TwoTenantFixture;

  beforeAll(async () => {
    fx = await createTwoTenantFixture("db7");
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(s.auditLog).where(eq(s.auditLog.tenantId, fx.tenantA));
    await db.delete(s.workflowEvents).where(eq(s.workflowEvents.tenantId, fx.tenantA));
    await db.delete(s.workflows).where(eq(s.workflows.tenantId, fx.tenantA));
    await fx?.cleanup();
  });

  it("2 concurrent audit appends both land; live chain verifies", async () => {
    const store = getStore();
    const [a, b] = await Promise.all([
      appendAudit(store, {
        tenantId: fx.tenantA, actorId: fx.userA.id, actorRole: "team_member",
        action: "db7.concurrent.a", subjectType: "probe", subjectId: 1, payload: { n: 1 },
      }),
      appendAudit(store, {
        tenantId: fx.tenantA, actorId: fx.userA.id, actorRole: "team_member",
        action: "db7.concurrent.b", subjectType: "probe", subjectId: 2, payload: { n: 2 },
      }),
    ]);
    expect(a.seq).not.toBe(b.seq);
    const rows = await store.listAudit(fx.tenantA);
    expect(rows).toHaveLength(2);
    expect(verifyAuditChain(rows).ok).toBe(true);
  });

  it("concurrent workflow event appends get distinct seqs (no unhandled dup error)", async () => {
    const store = getStore();
    const workflowId = await store.createWorkflow({
      tenantId: fx.tenantA, kind: "db7_probe", state: {},
    });
    const events = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        store.appendWorkflowEvent({
          tenantId: fx.tenantA, workflowId, type: "probe", payload: { i },
        }),
      ),
    );
    const seqs = events.map((e) => e.seq).sort((x, y) => x - y);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
  });

  it("5-way concurrent audit appends all land — no dup-key escape (regression: budget 3 lost ~40% of rows)", async () => {
    const store = getStore();
    const before = await store.listAudit(fx.tenantA);
    // Worst-case collision math: 5 concurrent writers, one insert can collide
    // up to 4 times — the old 3-attempt budget was provably insufficient
    // (stress: 159/400 appends lost). 10 attempts + jitter must absorb it.
    const appended = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        appendAudit(store, {
          tenantId: fx.tenantA, actorId: fx.userA.id, actorRole: "team_member",
          action: "db7.concurrent5", subjectType: "probe", subjectId: i + 1, payload: { i },
        }),
      ),
    );
    expect(new Set(appended.map((a) => a.seq)).size).toBe(5);
    const rows = await store.listAudit(fx.tenantA);
    expect(rows).toHaveLength(before.length + 5);
    expect(verifyAuditChain(rows).ok).toBe(true);
  });
});
