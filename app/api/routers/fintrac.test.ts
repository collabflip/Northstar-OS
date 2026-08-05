/**
 * F3 — FINTRAC anti-tipping-off. Only fintrac_officer sees FINTRAC details;
 * broker_of_record / admin / agent get redacted or absent data across:
 * (a) transactions.byId tasks, (b) compliance.overview queue count,
 * (c) audit.list view-attempt metadata.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@db/schema";
import { transactionsRouter } from "./transactions";
import { complianceRouter } from "./compliance";
import { auditRouter } from "./audit";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;
let officerUser: s.User;
let borUser: s.User;
let adminUser: s.User;
let txnId: number;

async function addMember(role: s.MembershipRole, label: string): Promise<s.User> {
  const db = (await import("../queries/connection")).getDb();
  const [u] = await db.insert(s.users).values({
    unionId: `test-f3-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `F3 ${label}`,
  }).$returningId();
  await fx.insert(s.memberships, { userId: u.id, tenantId: fx.tenantA, role, isDefault: true });
  // Track the user row for cleanup via a dummy insert list on the fixture.
  extraUserIds.push(u.id);
  return { id: u.id } as unknown as s.User;
}

const extraUserIds: number[] = [];

beforeAll(async () => {
  fx = await createTwoTenantFixture("f3");
  officerUser = await addMember("fintrac_officer", "officer");
  borUser = await addMember("broker_of_record", "bor");
  adminUser = await addMember("brokerage_admin", "admin");

  txnId = await fx.insert(s.transactions, {
    tenantId: fx.tenantA,
    propertyId: await fx.insert(s.properties, {
      tenantId: fx.tenantA,
      addressLine1: "9 Fintrac Ave",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V1J1",
    }),
    status: "conditional",
  });
  await fx.insert(s.transactionTasks, {
    tenantId: fx.tenantA, transactionId: txnId, kind: "fintrac_idv",
    title: "Verify client identity (FINTRAC)", status: "pending",
  });
  await fx.insert(s.transactionTasks, {
    tenantId: fx.tenantA, transactionId: txnId, kind: "condition",
    title: "Financing condition", status: "pending",
  });
  await fx.insert(s.auditLog, {
    seq: 900001, tenantId: fx.tenantA, action: "compliance.fintrac_queue_view_attempt",
    subjectType: "fintrac_queue", subjectId: "main",
    payloadHash: "ph", prevHash: "0", hash: "h1",
  });
  await fx.insert(s.auditLog, {
    seq: 900002, tenantId: fx.tenantA, action: "transaction.complete_task",
    subjectType: "transaction_task", subjectId: "1",
    payloadHash: "ph", prevHash: "h1", hash: "h2",
  });
});

afterAll(async () => {
  const db = (await import("../queries/connection")).getDb();
  const { inArray } = await import("drizzle-orm");
  if (extraUserIds.length) {
    await db.delete(s.users).where(inArray(s.users.id, extraUserIds));
  }
  await fx?.cleanup();
});

describe("F3 FINTRAC redaction", () => {
  it("transactions.byId: fintrac_officer sees FINTRAC tasks", async () => {
    const caller = transactionsRouter.createCaller(ctxFor(officerUser));
    const res = await caller.byId({ id: txnId });
    expect(res.tasks.some((t) => t.kind === "fintrac_idv")).toBe(true);
  });

  it("transactions.byId: broker_of_record does NOT see FINTRAC tasks", async () => {
    const caller = transactionsRouter.createCaller(ctxFor(borUser));
    const res = await caller.byId({ id: txnId });
    expect(res.tasks.some((t) => t.kind.startsWith("fintrac_"))).toBe(false);
    expect(res.tasks.some((t) => t.kind === "condition")).toBe(true);
  });

  it("compliance.overview: fintrac_officer sees the queue count", async () => {
    const caller = complianceRouter.createCaller(ctxFor(officerUser));
    const res = await caller.overview();
    expect(res.fintracQueue).toEqual({ count: expect.any(Number) });
  });

  it("compliance.overview: broker_of_record gets restricted (no count)", async () => {
    const caller = complianceRouter.createCaller(ctxFor(borUser));
    const res = await caller.overview();
    expect(res.fintracQueue).toBe("restricted");
  });

  it("audit.list: fintrac_officer sees view-attempt entries", async () => {
    const caller = auditRouter.createCaller(ctxFor(officerUser));
    const rows = await caller.list();
    expect(rows.some((r) => r.action === "compliance.fintrac_queue_view_attempt")).toBe(true);
  });

  it("audit.list: brokerage_admin does NOT see view-attempt entries but sees normal ones", async () => {
    const caller = auditRouter.createCaller(ctxFor(adminUser));
    const rows = await caller.list();
    expect(rows.some((r) => r.action === "compliance.fintrac_queue_view_attempt")).toBe(false);
    expect(rows.some((r) => r.subjectType === "fintrac_queue")).toBe(false);
    expect(rows.some((r) => r.action === "transaction.complete_task")).toBe(true);
  });
});
