/**
 * REDTEAM regression — COMP-5 / FIN-03/04/05/06 write-side gating.
 *
 * Previously proved transaction_tasks had NO fintrac_officer ownership
 * enforcement: any tenant member could mark a fintrac_str task done via
 * transactions.completeTask even though they could not SEE the task
 * (redaction hid read, not write). FIXED: fintrac_* task completion now
 * requires the fintrac_officer role; non-officer attempts are audited and
 * rejected with FORBIDDEN; officer completion still works.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@db/schema";
import { transactionsRouter } from "../routers/transactions";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;
let memberUser: s.User;
let fintracTaskId: number;

beforeAll(async () => {
  fx = await createTwoTenantFixture("redteam-fin");
  const db = (await import("../queries/connection")).getDb();
  const [u] = await db.insert(s.users).values({
    unionId: `redteam-fin-member-${Date.now()}`,
    name: "Redteam Member",
  }).$returningId();
  memberUser = { id: u.id } as unknown as s.User;
  await fx.insert(s.memberships, { userId: u.id, tenantId: fx.tenantA, role: "team_member", isDefault: true });

  const txnId = await fx.insert(s.transactions, {
    tenantId: fx.tenantA,
    propertyId: await fx.insert(s.properties, {
      tenantId: fx.tenantA, addressLine1: "1 Gap St", city: "Toronto",
      province: "ON", postalCode: "M5V1J1",
    }),
    status: "conditional",
  });
  fintracTaskId = await fx.insert(s.transactionTasks, {
    tenantId: fx.tenantA, transactionId: txnId, kind: "fintrac_str",
    title: "Evaluate suspicious deposit → STR", status: "pending",
  });
});

afterAll(async () => {
  const db = (await import("../queries/connection")).getDb();
  const { eq } = await import("drizzle-orm");
  await db.delete(s.users).where(eq(s.users.id, memberUser.id));
  await fx?.cleanup();
});

describe("regression: FINTRAC task gating enforced", () => {
  it("non-officer team_member CANNOT complete a fintrac_str task (FORBIDDEN, audited)", async () => {
    const caller = transactionsRouter.createCaller(ctxFor(memberUser, fx.tenantA) as never);
    // The caller cannot even SEE this task (F3 redaction) — and can no longer finalize it.
    await expect(caller.completeTask({ taskId: fintracTaskId }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    const db = (await import("../queries/connection")).getDb();
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(s.transactionTasks).where(eq(s.transactionTasks.id, fintracTaskId));
    expect(row.status).toBe("pending"); // untouched
  });

  it("fintrac_officer CAN complete the fintrac_str task", async () => {
    const db = (await import("../queries/connection")).getDb();
    const { eq } = await import("drizzle-orm");
    const [u] = await db.insert(s.users).values({
      unionId: `redteam-fin-officer-${Date.now()}`,
      name: "Redteam Officer",
    }).$returningId();
    await fx.insert(s.memberships, { userId: u.id, tenantId: fx.tenantA, role: "fintrac_officer", isDefault: true });
    const caller = transactionsRouter.createCaller(ctxFor({ id: u.id } as unknown as s.User, fx.tenantA) as never);
    try {
      await expect(caller.completeTask({ taskId: fintracTaskId })).resolves.toEqual({ ok: true });
      const [row] = await db.select().from(s.transactionTasks).where(eq(s.transactionTasks.id, fintracTaskId));
      expect(row.status).toBe("done");
    } finally {
      await db.delete(s.users).where(eq(s.users.id, u.id));
    }
  });
});
