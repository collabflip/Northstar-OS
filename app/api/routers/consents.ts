import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped, type Scope } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";
import { caslImpliedExpiry } from "../policy/controls";

/**
 * SEC-1: every consent/suppression write references a contactId — that
 * contact MUST exist in the caller's tenant, otherwise the write binds
 * caller-tenant rows to a foreign tenant's contact (reference pollution).
 */
async function requireTenantContact(scope: Scope, contactId: number): Promise<void> {
  const [contact] = await getDb().select({ id: s.contacts.id }).from(s.contacts).where(
    and(eq(s.contacts.tenantId, scope.tenantId), eq(s.contacts.id, contactId)),
  );
  if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
}

export const consentsRouter = createRouter({
  byContact: authedQuery.input(z.object({ contactId: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    return getDb().select().from(s.consentRecords).where(
      and(eq(s.consentRecords.tenantId, scope.tenantId), eq(s.consentRecords.contactId, input.contactId)),
    );
  }),

  expiringSoon: authedQuery.input(z.object({ days: z.number().default(30) }).optional()).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const rows = await getDb().select().from(s.consentRecords).where(eq(s.consentRecords.tenantId, scope.tenantId));
    const window = (input?.days ?? 30) * 86400000;
    return rows.filter((c) =>
      c.status === "active" && c.expiresAt &&
      c.expiresAt.getTime() >= Date.now() && c.expiresAt.getTime() - Date.now() <= window,
    );
  }),

  record: authedQuery
    .input(z.object({
      contactId: z.number(),
      channel: z.enum(["email", "sms", "voice", "dm"]),
      basis: z.enum(["express", "implied", "none"]),
      evidenceText: z.string().min(1),
      source: z.string().min(1),
      purpose: z.string().min(1),
      impliedKind: z.enum(["ebr", "inquiry"]).optional(),
      capturedAt: z.coerce.date().default(() => new Date()),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      await requireTenantContact(scope, input.contactId);
      const expiresAt = input.basis === "implied"
        ? caslImpliedExpiry(input.impliedKind ?? "inquiry", input.capturedAt)
        : null;
      const [{ id }] = await db.insert(s.consentRecords).values({
        tenantId: scope.tenantId,
        contactId: input.contactId,
        channel: input.channel,
        basis: input.basis,
        evidenceText: input.evidenceText,
        source: input.source,
        purpose: input.purpose,
        capturedAt: input.capturedAt,
        expiresAt,
        status: "active",
      }).$returningId();
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "consent.record", subjectType: "contact", subjectId: input.contactId,
        payload: { channel: input.channel, basis: input.basis, source: input.source },
      });
      return { id, expiresAt };
    }),

  suppress: authedQuery
    .input(z.object({ contactId: z.number(), channel: z.enum(["email", "sms", "voice", "dm"]), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      await requireTenantContact(scope, input.contactId);
      await db.insert(s.suppressionList).values({
        tenantId: scope.tenantId, contactId: input.contactId, channel: input.channel, reason: input.reason,
      }).onDuplicateKeyUpdate({ set: { reason: input.reason } });
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "consent.suppress", subjectType: "contact", subjectId: input.contactId,
        payload: input,
      });
      return { ok: true };
    }),

  /** CASL-06: suppression is system-managed — manual removal is refused. */
  unsuppress: authedQuery
    .input(z.object({ contactId: z.number(), channel: z.enum(["email", "sms", "voice", "dm"]), reConsentEvidence: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      await requireTenantContact(scope, input.contactId);
      await db.delete(s.suppressionList).where(
        and(
          eq(s.suppressionList.tenantId, scope.tenantId),
          eq(s.suppressionList.contactId, input.contactId),
          eq(s.suppressionList.channel, input.channel),
        ),
      );
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "consent.unsuppress", subjectType: "contact", subjectId: input.contactId,
        payload: { channel: input.channel, reConsentEvidence: "provided" },
      });
      return { ok: true };
    }),
});
