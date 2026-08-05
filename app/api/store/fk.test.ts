/**
 * DB-1 — foreign keys are enforced by the live database (TiDB 8.5).
 * A child row with a bogus parent id is rejected by the FK constraint;
 * tenant teardown cascades to children.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createTwoTenantFixture, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;

beforeAll(async () => {
  fx = await createTwoTenantFixture("fk1");
});

afterAll(async () => {
  await fx?.cleanup();
});

describe("DB-1 foreign key enforcement (live DB)", () => {
  /** Drizzle wraps driver errors — the FK message is on the error cause chain. */
  async function expectFkViolation(p: Promise<unknown>) {
    try {
      await p;
    } catch (err) {
      const chain = [String((err as Error).message), String((err as { cause?: Error }).cause?.message ?? "")].join(" | ");
      expect(chain).toMatch(/foreign key/i);
      return;
    }
    throw new Error("expected a foreign key violation, but the insert succeeded");
  }

  it("inserting a child with a bogus parent id fails", async () => {
    const db = getDb();
    // bogus contactId — no such contacts.id anywhere
    await expectFkViolation(
      db.insert(s.consentRecords).values({
        tenantId: fx.tenantA,
        contactId: 999_999_999,
        channel: "email",
        basis: "express",
        capturedAt: new Date(),
        status: "active",
      }),
    );
    // bogus tenantId too
    await expectFkViolation(
      db.insert(s.contacts).values({
        tenantId: 999_999_999,
        firstName: "Bogus",
        lastName: "Parent",
      }),
    );
  });

  it("valid parent ids still insert, and tenant delete cascades to children", async () => {
    const db = getDb();
    const contactId = await fx.insert(s.contacts, {
      tenantId: fx.tenantA,
      firstName: "Cascade",
      lastName: "Check",
    });
    await fx.insert(s.consentRecords, {
      tenantId: fx.tenantA,
      contactId,
      channel: "email",
      basis: "express",
      capturedAt: new Date(),
      status: "active",
    });
    // deleting the tenant cascades (ON DELETE CASCADE) — no orphan children
    await db.delete(s.tenants).where(eq(s.tenants.id, fx.tenantA));
    const orphans = await db
      .select()
      .from(s.consentRecords)
      .where(eq(s.consentRecords.tenantId, fx.tenantA));
    expect(orphans).toHaveLength(0);
    // recreate tenantA so afterAll cleanup still has something to delete
    const restored = await fx.insert(s.tenants, { name: `TEST fk1 A restored ${Date.now()}`, province: "ON" });
    await db.insert(s.memberships).values({ userId: fx.userA.id, tenantId: restored, role: "team_member", isDefault: true });
    fx.tenantA = restored;
  });
});
