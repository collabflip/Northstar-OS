import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";

export const propertiesRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    return getDb().select().from(s.properties).where(eq(s.properties.tenantId, scope.tenantId));
  }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [property] = await db.select().from(s.properties).where(
      and(eq(s.properties.tenantId, scope.tenantId), eq(s.properties.id, input.id)),
    );
    if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
    const [dossier] = await db.select().from(s.dossiers).where(
      and(eq(s.dossiers.tenantId, scope.tenantId), eq(s.dossiers.propertyId, input.id)),
    ).orderBy(desc(s.dossiers.id)).limit(1);
    const evidenceRows = await db.select().from(s.evidence).where(
      and(eq(s.evidence.tenantId, scope.tenantId), eq(s.evidence.subjectType, "property"), eq(s.evidence.subjectId, input.id)),
    );
    const owner = property.ownerContactId
      ? (await db.select().from(s.contacts).where(and(eq(s.contacts.tenantId, scope.tenantId), eq(s.contacts.id, property.ownerContactId))))[0]
      : null;
    return { property, dossier: dossier ?? null, evidence: evidenceRows, owner };
  }),
});
