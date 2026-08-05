/**
 * Live-DB test fixtures: two tenants with one member each, plus cleanup.
 * Used by cross-tenant router/security tests (DrizzleStore path). Every row
 * created here is deleted by fixture.cleanup() in afterAll.
 */
import { inArray } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import type { TrpcContext } from "../context";

/** Any MySQL table with a numeric auto-increment `id` column (fixture-tracked). */
type IdTable = MySqlTable & { id: Column };

export interface TwoTenantFixture {
  tenantA: number;
  tenantB: number;
  userA: s.User;
  userB: s.User;
  /** Insert a row and return its auto-increment id (tracked for cleanup). */
  insert(table: IdTable, values: Record<string, unknown>): Promise<number>;
  cleanup(): Promise<void>;
}

let seq = 0;

export async function createTwoTenantFixture(tag: string): Promise<TwoTenantFixture> {
  const db = getDb();
  const uniq = `${tag}-${Date.now()}-${++seq}`;

  const [tA] = await db.insert(s.tenants).values({
    name: `TEST ${tag} A ${uniq}`,
    province: "ON",
  }).$returningId();
  const [tB] = await db.insert(s.tenants).values({
    name: `TEST ${tag} B ${uniq}`,
    province: "ON",
  }).$returningId();

  const [uA] = await db.insert(s.users).values({
    unionId: `test-${tag}-a-${uniq}`,
    name: `Test ${tag} A`,
  }).$returningId();
  const [uB] = await db.insert(s.users).values({
    unionId: `test-${tag}-b-${uniq}`,
    name: `Test ${tag} B`,
  }).$returningId();

  await db.insert(s.memberships).values([
    { userId: uA.id, tenantId: tA.id, role: "team_member", isDefault: true },
    { userId: uB.id, tenantId: tB.id, role: "team_member", isDefault: true },
  ]);

  const created: { table: IdTable; ids: number[] }[] = [
    { table: s.tenants, ids: [tA.id, tB.id] },
    { table: s.users, ids: [uA.id, uB.id] },
  ];

  const fixture: TwoTenantFixture = {
    tenantA: tA.id,
    tenantB: tB.id,
    userA: { id: uA.id } as unknown as s.User,
    userB: { id: uB.id } as unknown as s.User,
    async insert(table: IdTable, values: Record<string, unknown>) {
      const [row] = (await db.insert(table).values(values).$returningId()) as { id: number }[];
      created.push({ table, ids: [row.id] });
      return row.id;
    },
    async cleanup() {
      await db.delete(s.memberships).where(inArray(s.memberships.userId, [uA.id, uB.id]));
      for (const { table, ids } of [...created].reverse()) {
        await db.delete(table).where(inArray(table.id, ids));
      }
    },
  };
  return fixture;
}

/** Build a minimal TrpcContext for a caller, optionally pinning x-tenant-id. */
export function ctxFor(user: s.User, tenantId?: number): TrpcContext {
  const headers = new Headers();
  if (tenantId !== undefined) headers.set("x-tenant-id", String(tenantId));
  return {
    req: new Request("http://test.local/trpc", { headers }),
    resHeaders: new Headers(),
    user,
  };
}
