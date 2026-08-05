import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";
import { ON_PACK } from "../policy/packs/on";
import { BC_PACK } from "../policy/packs/bc";
import { AB_PACK } from "../policy/packs/ab";
import { QC_PACK } from "../policy/packs/qc";

const PACKS = { ON: ON_PACK, BC: BC_PACK, AB: AB_PACK, QC: QC_PACK } as const;

export const policyRouter = createRouter({
  packs: authedQuery.query(async ({ ctx }) => {
    await scoped(ctx);
    return Object.values(PACKS).map((p) => ({
      jurisdiction: p.jurisdiction, version: p.version, status: p.status,
      owner: p.owner, effectiveDate: p.effectiveDate, reviewDate: p.reviewDate ?? null,
      ruleCount: p.rules.length, disclaimer: p.disclaimer,
    }));
  }),

  rules: authedQuery.input(z.object({ jurisdiction: z.enum(["ON", "BC", "AB", "QC"]) })).query(async ({ ctx, input }) => {
    await scoped(ctx);
    return PACKS[input.jurisdiction].rules;
  }),

  decisions: authedQuery.input(z.object({ limit: z.number().default(100) }).optional()).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    return getDb().select().from(s.policyDecisions).where(eq(s.policyDecisions.tenantId, scope.tenantId)).orderBy(desc(s.policyDecisions.id)).limit(input?.limit ?? 100);
  }),
});
