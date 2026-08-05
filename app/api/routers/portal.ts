import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";

/** Seller portal — scoped, read-mostly view for the seller role. */
export const portalRouter = createRouter({
  myProperty: authedQuery.input(z.object({ contactId: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [property] = await db.select().from(s.properties).where(
      and(eq(s.properties.tenantId, scope.tenantId), eq(s.properties.ownerContactId, input.contactId)),
    );
    if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "No property for this seller" });
    const [dossier] = await db.select().from(s.dossiers).where(
      and(eq(s.dossiers.tenantId, scope.tenantId), eq(s.dossiers.propertyId, property.id)),
    ).orderBy(desc(s.dossiers.id)).limit(1);
    const valuation = dossier
      ? (await db.select().from(s.valuations).where(eq(s.valuations.dossierId, dossier.id)).orderBy(desc(s.valuations.id)).limit(1))[0]
      : null;
    return {
      property,
      status: dossier?.status ?? "intake",
      valuation: valuation
        ? { low: valuation.low, mid: valuation.mid, high: valuation.high, confidenceInterval: valuation.confidenceInterval, disclaimer: valuation.disclaimer }
        : null,
      missingInfo: (dossier?.missingInfo as string[] | null) ?? [],
      banner: "Decision support — not an appraisal or a guaranteed sale price.",
    };
  }),
});
