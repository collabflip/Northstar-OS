import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";

// F1: every lookup is tenant-scoped — guessing another tenant's dossier/property
// id must return null, never the foreign record.
export const valuationsRouter = createRouter({
  latestByDossier: authedQuery.input(z.object({ dossierId: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const rows = await getDb().select().from(s.valuations).where(
      and(
        eq(s.valuations.dossierId, input.dossierId),
        eq(s.valuations.tenantId, scope.tenantId),
      ),
    ).orderBy(desc(s.valuations.id)).limit(1);
    return rows[0] ?? null;
  }),

  byProperty: authedQuery.input(z.object({ propertyId: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const dossierRows = await db.select().from(s.dossiers).where(
      and(
        eq(s.dossiers.propertyId, input.propertyId),
        eq(s.dossiers.tenantId, scope.tenantId),
      ),
    );
    if (!dossierRows.length) return null;
    const rows = await db.select().from(s.valuations).where(
      and(
        eq(s.valuations.dossierId, dossierRows[0].id),
        eq(s.valuations.tenantId, scope.tenantId),
      ),
    ).orderBy(desc(s.valuations.id)).limit(1);
    return rows[0] ?? null;
  }),
});
