import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped, requireRoles } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";

export const strategiesRouter = createRouter({
  byProperty: authedQuery.input(z.object({ propertyId: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const rows = await getDb().select().from(s.strategies).where(
      and(eq(s.strategies.tenantId, scope.tenantId), eq(s.strategies.propertyId, input.propertyId)),
    ).orderBy(desc(s.strategies.id)).limit(1);
    return rows[0] ?? null;
  }),

  setStatus: authedQuery
    .input(z.object({ id: z.number(), status: z.enum(["draft", "proposed", "approved", "rejected"]), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      if (input.status === "approved") requireRoles(scope, ["broker_of_record"]); // A4
      const db = getDb();
      await db.update(s.strategies).set({ status: input.status }).where(
        and(eq(s.strategies.tenantId, scope.tenantId), eq(s.strategies.id, input.id)),
      );
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: `strategy.${input.status}`, subjectType: "strategy", subjectId: input.id,
        payload: { status: input.status, reason: input.reason ?? null },
      });
      return { ok: true };
    }),
});
