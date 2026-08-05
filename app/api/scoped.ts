import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "./queries/connection";
import type { TrpcContext } from "./context";

export interface Scope {
  tenantId: number;
  userId: number;
  /** Membership role within the resolved tenant (includes demo `seller`). */
  role: s.MembershipRole;
  membershipId: number;
}

/**
 * Tenant scope resolver — THE tenant-isolation chokepoint. Every router query
 * must call scoped(ctx) and filter by the returned tenantId. Tenant selection:
 * explicit x-tenant-id header (validated against the user's memberships) or
 * the user's default/first membership. No membership → FORBIDDEN.
 */
export async function scoped(ctx: TrpcContext): Promise<Scope> {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  const db = getDb();
  const memberships = await db
    .select()
    .from(s.memberships)
    .where(eq(s.memberships.userId, ctx.user.id));
  if (memberships.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tenant membership — contact your brokerage admin",
    });
  }
  const requested = ctx.req.headers.get("x-tenant-id");
  let chosen = memberships.find((m) => m.isDefault) ?? memberships[0];
  if (requested) {
    const wanted = memberships.find((m) => m.tenantId === Number(requested));
    if (!wanted) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Not a member of the requested tenant",
      });
    }
    chosen = wanted;
  }
  return {
    tenantId: chosen.tenantId,
    userId: ctx.user.id,
    role: chosen.role,
    membershipId: chosen.id,
  };
}

export function requireRoles(scope: Scope, roles: string[]): void {
  if (!roles.includes(scope.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Requires role: ${roles.join(" or ")}`,
    });
  }
}

/** Object-level authorization: FINTRAC queue is fintrac_officer only (FIN-07). */
export function requireFintracOfficer(scope: Scope): void {
  requireRoles(scope, ["fintrac_officer"]);
}

export { and, eq };
