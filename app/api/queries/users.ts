import { and, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser, Membership, MembershipRole } from "@db/schema";
import { membershipRoleValues } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    ...data,
  };

  if (
    values.role === undefined &&
    values.unionId &&
    values.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await getDb()
    .insert(schema.users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

// ─── F2: first-login demo provisioning ──────────────────────────────────────

/**
 * Demo tenant names in priority order. The current seed creates
 * "Harbourline Realty Inc., Brokerage"; "Northstar Demo Brokerage" is the
 * earlier seed vintage. Both are accepted so provisioning works against
 * either seed vintage.
 */
export const DEMO_TENANT_NAMES = [
  "Northstar Demo Brokerage",
  "Harbourline Realty Inc., Brokerage",
] as const;

export const DEFAULT_DEMO_ROLE: MembershipRole = "team_member";

/** Roles a demo user may self-select (any brokerage membership role). */
export const demoRoleValues = membershipRoleValues;

export async function findDemoTenant() {
  const db = getDb();
  for (const name of DEMO_TENANT_NAMES) {
    const rows = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.name, name))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  return undefined;
}

/**
 * On first login (user has no membership anywhere), join the seeded demo
 * brokerage with a demo role. Idempotent: a second call is a no-op so repeat
 * logins never duplicate the membership.
 */
export async function provisionFirstLoginDemoMembership(
  userId: number,
  role: MembershipRole = DEFAULT_DEMO_ROLE,
): Promise<{ created: boolean; membership: Membership | null }> {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    return { created: false, membership: existing[0] };
  }
  const tenant = await findDemoTenant();
  if (!tenant) {
    console.warn(
      "[auth] No seeded demo tenant found; leaving user tenantless (seed the DB first).",
    );
    return { created: false, membership: null };
  }
  const [row] = await db
    .insert(schema.memberships)
    .values({ userId, tenantId: tenant.id, role, isDefault: true })
    .$returningId();
  const membership: Membership = {
    id: row.id,
    userId,
    tenantId: tenant.id,
    role,
    isDefault: true,
    createdAt: new Date(),
  };
  return { created: true, membership };
}

/** Switch the caller's demo role within one of their tenant memberships. */
export async function setDemoRole(
  userId: number,
  tenantId: number,
  role: MembershipRole,
): Promise<void> {
  await getDb()
    .update(schema.memberships)
    .set({ role })
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, tenantId),
      ),
    );
}
