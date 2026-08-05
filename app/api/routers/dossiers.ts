import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";

export const dossiersRouter = createRouter({
  byProperty: authedQuery.input(z.object({ propertyId: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [dossier] = await db.select().from(s.dossiers).where(
      and(eq(s.dossiers.tenantId, scope.tenantId), eq(s.dossiers.propertyId, input.propertyId)),
    ).orderBy(desc(s.dossiers.id)).limit(1);
    if (!dossier) throw new TRPCError({ code: "NOT_FOUND", message: "Dossier not found" });
    const comps = await db.select().from(s.comparables).where(eq(s.comparables.dossierId, dossier.id));
    const [valuation] = await db.select().from(s.valuations).where(eq(s.valuations.dossierId, dossier.id)).orderBy(desc(s.valuations.id)).limit(1);
    const evidenceRows = await db.select().from(s.evidence).where(
      and(eq(s.evidence.tenantId, scope.tenantId), eq(s.evidence.subjectType, "dossier"), eq(s.evidence.subjectId, dossier.id)),
    );
    return { dossier, comparables: comps, valuation: valuation ?? null, evidence: evidenceRows };
  }),

  resolveContradiction: authedQuery
    .input(z.object({
      dossierId: z.number(),
      field: z.string().min(1),
      chosenValue: z.string().min(1),
      rationale: z.string().min(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const [dossier] = await db.select().from(s.dossiers).where(
        and(eq(s.dossiers.tenantId, scope.tenantId), eq(s.dossiers.id, input.dossierId)),
      );
      if (!dossier) throw new TRPCError({ code: "NOT_FOUND", message: "Dossier not found" });
      const contradictions = ((dossier.contradictions as { field: string; values: string[] }[] | null) ?? [])
        .filter((c) => c.field !== input.field);
      const profile = { ...((dossier.profile as Record<string, unknown> | null) ?? {}), [input.field]: { value: input.chosenValue, resolvedBy: scope.userId } };
      await db.update(s.dossiers).set({ contradictions, profile }).where(eq(s.dossiers.id, dossier.id));
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "dossier.resolve_contradiction", subjectType: "dossier", subjectId: dossier.id,
        payload: input,
      });
      return { ok: true };
    }),
});
