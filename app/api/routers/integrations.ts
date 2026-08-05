import { z } from "zod";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";
import { MockListingDataProvider } from "../integrations/mockListingData";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";

export const integrationsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    await scoped(ctx);
    return getDb().select().from(s.integrations);
  }),

  /** Mock listing sync — truthful mock status, cursor + provenance. */
  syncListings: authedQuery
    .input(z.object({ cursor: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const provider = new MockListingDataProvider();
      const result = await provider.sync(input?.cursor);
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "integrations.sync_listings", subjectType: "integration", subjectId: "mock-listing-data",
        payload: { records: result.records.length, nextCursor: result.nextCursor, status: "mock" },
      });
      return result;
    }),
});
