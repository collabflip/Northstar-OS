import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped, requireRoles } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";

export const settingsRouter = createRouter({
  tenant: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [tenant] = await db.select().from(s.tenants).where(eq(s.tenants.id, scope.tenantId));
    const members = await db
      .select({ membership: s.memberships, user: { id: s.users.id, name: s.users.name, email: s.users.email, avatar: s.users.avatar } })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(eq(s.memberships.tenantId, scope.tenantId));
    return { tenant, members, me: scope };
  }),

  setAutonomyCeiling: authedQuery
    .input(z.object({ ceiling: z.enum(["A0", "A1", "A2", "A3", "A4"]) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      requireRoles(scope, ["broker_of_record"]);
      const db = getDb();
      await db.update(s.tenants).set({ autonomyCeiling: input.ceiling }).where(eq(s.tenants.id, scope.tenantId));
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "settings.set_autonomy", subjectType: "tenant", subjectId: scope.tenantId,
        payload: input,
      });
      return { ok: true };
    }),
});
