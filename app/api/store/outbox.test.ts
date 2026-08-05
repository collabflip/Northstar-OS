/**
 * F10 — outbox idempotency is per-tenant (DrizzleStore against the live DB):
 * the same key in two tenants is accepted for both; the same key in the same
 * tenant dedupes with no duplicate effect.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { getStore } from "./drizzle";
import { createTwoTenantFixture, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;
const KEY = `f10_shared_${Date.now()}`;

beforeAll(async () => {
  fx = await createTwoTenantFixture("f10");
});

afterAll(async () => {
  const db = getDb();
  await db.delete(s.outbox).where(eq(s.outbox.idempotencyKey, KEY));
  await fx?.cleanup();
});

describe("F10 tenant-scoped outbox idempotency", () => {
  it("same key in two tenants → both accepted", async () => {
    const store = getStore();
    const a = await store.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: KEY, action: "cem.send", payload: { n: 1 } });
    const b = await store.enqueueOutbox({ tenantId: fx.tenantB, idempotencyKey: KEY, action: "cem.send", payload: { n: 2 } });
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(b.id).not.toBe(a.id);
  });

  it("same key in the same tenant → deduped (no duplicate row/effect)", async () => {
    const store = getStore();
    const again = await store.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: KEY, action: "cem.send", payload: { n: 1 } });
    expect(again.created).toBe(false);
    const rows = await getDb().select().from(s.outbox).where(eq(s.outbox.idempotencyKey, KEY));
    expect(rows).toHaveLength(2); // one per tenant, not three
    const mine = rows.filter((r) => r.tenantId === fx.tenantA);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(again.id);
  });

  it("lookups are tenant-scoped", async () => {
    const store = getStore();
    const a = await store.getOutboxByKey(fx.tenantA, "cem.send", KEY);
    const b = await store.getOutboxByKey(fx.tenantB, "cem.send", KEY);
    expect(a?.tenantId).toBe(fx.tenantA);
    expect(b?.tenantId).toBe(fx.tenantB);
    expect(a?.id).not.toBe(b?.id);
  });
});

describe("SEC-5 action-scoped dedupe (DrizzleStore, live DB)", () => {
  const AKEY = `sec5_squat_${Date.now()}`;

  afterAll(async () => {
    const db = getDb();
    await db.delete(s.outbox).where(eq(s.outbox.idempotencyKey, AKEY));
  });

  it("same key under different actions both land; same action dedupes", async () => {
    const store = getStore();
    const cem = await store.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: AKEY, action: "cem.send", payload: {} });
    const launch = await store.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: AKEY, action: "campaign.launch", payload: {} });
    expect(cem.created).toBe(true);
    expect(launch.created).toBe(true); // squatting no longer swallows the launch intent
    expect(launch.id).not.toBe(cem.id);

    const dup = await store.enqueueOutbox({ tenantId: fx.tenantA, idempotencyKey: AKEY, action: "cem.send", payload: {} });
    expect(dup.created).toBe(false);
    expect(dup.id).toBe(cem.id);

    expect((await store.getOutboxByKey(fx.tenantA, "cem.send", AKEY))?.id).toBe(cem.id);
    expect((await store.getOutboxByKey(fx.tenantA, "campaign.launch", AKEY))?.id).toBe(launch.id);
  });
});
