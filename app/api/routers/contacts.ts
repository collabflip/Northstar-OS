import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";

export const contactsRouter = createRouter({
  list: authedQuery
    .input(z.object({ kind: z.string().optional(), stage: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const rows = await getDb().select().from(s.contacts).where(eq(s.contacts.tenantId, scope.tenantId));
      return rows.filter((c) =>
        (!input?.kind || c.kind === input.kind) && (!input?.stage || c.stage === input.stage),
      );
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [contact] = await db.select().from(s.contacts).where(
      and(eq(s.contacts.tenantId, scope.tenantId), eq(s.contacts.id, input.id)),
    );
    if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
    const consents = await db.select().from(s.consentRecords).where(
      and(eq(s.consentRecords.tenantId, scope.tenantId), eq(s.consentRecords.contactId, input.id)),
    );
    const suppressions = await db.select().from(s.suppressionList).where(
      and(eq(s.suppressionList.tenantId, scope.tenantId), eq(s.suppressionList.contactId, input.id)),
    );
    const properties = await db.select().from(s.properties).where(
      and(eq(s.properties.tenantId, scope.tenantId), eq(s.properties.ownerContactId, input.id)),
    );
    return { contact, consents, suppressions, properties };
  }),

  create: authedQuery
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      kind: z.enum(["seller", "buyer_lead", "srp", "other"]).default("seller"),
      leadSource: z.string().optional(),
      language: z.string().default("en"),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const [{ id }] = await db.insert(s.contacts).values({
        tenantId: scope.tenantId, ...input, isSrp: input.kind === "srp",
      }).$returningId();
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "contact.create", subjectType: "contact", subjectId: id, payload: input,
      });
      return { id };
    }),

  updateScore: authedQuery
    .input(z.object({ id: z.number(), score: z.number().min(0).max(100), reasons: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      await db.update(s.contacts).set({ leadScore: input.score, leadScoreReasons: input.reasons }).where(
        and(eq(s.contacts.tenantId, scope.tenantId), eq(s.contacts.id, input.id)),
      );
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "contact.rescore", subjectType: "contact", subjectId: input.id,
        payload: { score: input.score, reasons: input.reasons },
      });
      return { ok: true };
    }),
});
