/**
 * F2 — first-login demo provisioning + demo role selection.
 * Runs against the live DB (requires the seeded demo tenant).
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "./connection";
import {
  findDemoTenant,
  provisionFirstLoginDemoMembership,
} from "./users";
import { authRouter } from "../auth-router";
import { ctxFor } from "../testkit/liveDb";

const unionId = `test-f2-${Date.now()}`;
let userId = 0;

afterAll(async () => {
  const db = getDb();
  if (userId) {
    await db.delete(s.memberships).where(eq(s.memberships.userId, userId));
    await db.delete(s.users).where(eq(s.users.id, userId));
  }
});

describe("F2 first-login demo provisioning", () => {
  it("provisions a demo-tenant membership on first login", async () => {
    const db = getDb();
    const demo = await findDemoTenant();
    expect(demo, "seeded demo tenant must exist").toBeDefined();

    const [u] = await db.insert(s.users).values({ unionId, name: "F2 Test" }).$returningId();
    userId = u.id;

    const result = await provisionFirstLoginDemoMembership(userId);
    expect(result.created).toBe(true);
    expect(result.membership?.tenantId).toBe(demo!.id);
    expect(result.membership?.isDefault).toBe(true);
  });

  it("does not duplicate the membership on second login", async () => {
    const db = getDb();
    const again = await provisionFirstLoginDemoMembership(userId);
    expect(again.created).toBe(false);
    const rows = await db.select().from(s.memberships).where(eq(s.memberships.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("chooseDemoRole updates the caller's demo membership role", async () => {
    const caller = authRouter.createCaller(ctxFor({ id: userId } as unknown as s.User));
    const res = await caller.chooseDemoRole({ role: "seller" });
    expect(res.ok).toBe(true);
    const rows = await getDb().select().from(s.memberships).where(eq(s.memberships.userId, userId));
    expect(rows[0].role).toBe("seller");
  });

  it("chooseDemoRole rejects roles outside the enum", async () => {
    const caller = authRouter.createCaller(ctxFor({ id: userId } as unknown as s.User));
    await expect(
      // @ts-expect-error intentionally invalid role
      caller.chooseDemoRole({ role: "superuser" }),
    ).rejects.toThrow();
    // Role unchanged after the rejected attempt.
    const rows = await getDb().select().from(s.memberships).where(eq(s.memberships.userId, userId));
    expect(rows[0].role).toBe("seller");
  });
});
