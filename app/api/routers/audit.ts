import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";
import { redactFintracAudit } from "../lib/fintrac";
import { getStore } from "../store/drizzle";
import { verifyAuditChain } from "../audit";

export const auditRouter = createRouter({
  list: authedQuery
    .input(z.object({ subjectType: z.string().optional(), limit: z.number().default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const rows = await getDb().select().from(s.auditLog).where(eq(s.auditLog.tenantId, scope.tenantId)).orderBy(desc(s.auditLog.seq)).limit(input?.limit ?? 100);
      const filtered = rows.filter((r) => !input?.subjectType || r.subjectType === input.subjectType);
      // F3: FINTRAC view-attempt metadata is visible only to the fintrac_officer.
      return redactFintracAudit(scope.role, filtered);
    }),

  verifyChain: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    const rows = await getStore().listAudit(scope.tenantId);
    return { entries: rows.length, ...verifyAuditChain(rows) };
  }),
});
