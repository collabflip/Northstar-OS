import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped, requireRoles } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";
import { OfferExtraction } from "../agents";

export const offersRouter = createRouter({
  byProperty: authedQuery.input(z.object({ propertyId: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const offerRows = await db.select().from(s.offers).where(
      and(eq(s.offers.tenantId, scope.tenantId), eq(s.offers.propertyId, input.propertyId)),
    ).orderBy(asc(s.offers.receivedAt));
    // ARCH-6: one batched terms query for ALL offers (was N+1 per-offer SELECTs).
    const allTerms = offerRows.length === 0 ? [] : await db.select().from(s.offerTerms).where(
      and(eq(s.offerTerms.tenantId, scope.tenantId), inArray(s.offerTerms.offerId, offerRows.map((o) => o.id))),
    );
    const termsByOffer = new Map<number, typeof allTerms>();
    for (const t of allTerms) {
      const list = termsByOffer.get(t.offerId);
      if (list) list.push(t);
      else termsByOffer.set(t.offerId, [t]);
    }
    return offerRows.map((o) => ({ offer: o, terms: termsByOffer.get(o.id) ?? [] }));
  }),

  /** Upload + deterministic extraction (rules-based parser, page/section citations). */
  upload: authedQuery
    .input(z.object({
      propertyId: z.number(),
      buyerLabel: z.string().min(1),
      fileName: z.string().min(1),
      documentText: z.string().min(10),
      irrevocableUntil: z.coerce.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const store = getStore();
      // SEC-1: the referenced property must belong to the caller's tenant
      // (mirrors recordSellerDirection) — never bind an offer to a foreign
      // tenant's propertyId (cross-tenant reference pollution).
      const [property] = await db.select().from(s.properties).where(
        and(eq(s.properties.tenantId, scope.tenantId), eq(s.properties.id, input.propertyId)),
      );
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      const extraction = OfferExtraction.run({ documentText: input.documentText });
      const [{ id: offerId }] = await db.insert(s.offers).values({
        tenantId: scope.tenantId, propertyId: input.propertyId, buyerLabel: input.buyerLabel,
        fileName: input.fileName, documentText: input.documentText,
        receivedAt: new Date(), irrevocableUntil: input.irrevocableUntil ?? null,
        extractionConfidence: extraction.result.extractionConfidence, status: "extracted",
      }).$returningId();
      // ARCH-6: single batched INSERT for all extracted terms (was N round trips).
      if (extraction.result.terms.length > 0) {
        await db.insert(s.offerTerms).values(
          extraction.result.terms.map((t) => ({
            tenantId: scope.tenantId, offerId, field: t.field, value: t.value,
            sourcePage: t.sourcePage, sourceSection: t.sourceSection,
            confidence: t.confidence, flag: t.flag === "none" ? null : t.flag, flagNote: t.flagNote,
          })),
        );
      }
      await appendAudit(store, {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "offer.upload_extract", subjectType: "offer", subjectId: offerId,
        payload: { buyerLabel: input.buyerLabel, terms: extraction.result.terms.length, confidence: extraction.result.extractionConfidence },
        modelVersion: extraction.modelVersion, promptVersion: extraction.promptVersion,
      });
      return { offerId, extraction: extraction.result };
    }),

  verifyTerm: authedQuery
    .input(z.object({ termId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      await db.update(s.offerTerms).set({ verifiedBy: scope.userId, verifiedAt: new Date() }).where(
        and(eq(s.offerTerms.tenantId, scope.tenantId), eq(s.offerTerms.id, input.termId)),
      );
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "offer.verify_term", subjectType: "offer_term", subjectId: input.termId, payload: {},
      });
      return { ok: true };
    }),

  /** A4 seller decision — BOR/registrant countersign, sealed audit event. */
  recordDecision: authedQuery
    .input(z.object({
      offerId: z.number(),
      decisionType: z.enum(["accept", "counter", "decline", "note"]),
      instruction: z.string().min(3),
      countersignUserId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      requireRoles(scope, ["broker_of_record"]); // A4 — human-only commit
      const db = getDb();
      const [offer] = await db.select().from(s.offers).where(
        and(eq(s.offers.tenantId, scope.tenantId), eq(s.offers.id, input.offerId)),
      );
      if (!offer) throw new TRPCError({ code: "NOT_FOUND", message: "Offer not found" });
      await db.update(s.offers).set({ status: "decided" }).where(eq(s.offers.id, offer.id));
      const audit = await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "offer.record_decision", subjectType: "offer", subjectId: offer.id,
        payload: { decisionType: input.decisionType, instruction: input.instruction, countersignUserId: input.countersignUserId },
      });
      return { ok: true, auditHash: audit.hash };
    }),

  /**
   * F8: capture written seller direction as a persisted artifact. TRESA-08
   * flows reference the returned artifact id — a caller-asserted boolean is
   * never accepted as direction.
   */
  recordSellerDirection: authedQuery
    .input(z.object({
      propertyId: z.number(),
      contactId: z.number().optional(),
      signedEvidenceText: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const [property] = await db.select().from(s.properties).where(
        and(eq(s.properties.tenantId, scope.tenantId), eq(s.properties.id, input.propertyId)),
      );
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      const [row] = await db.insert(s.sellerDirectionArtifacts).values({
        tenantId: scope.tenantId,
        propertyId: input.propertyId,
        contactId: input.contactId ?? property.ownerContactId ?? null,
        signedEvidenceText: input.signedEvidenceText,
        status: "pending",
      }).$returningId();
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "offer.record_seller_direction", subjectType: "seller_direction_artifact", subjectId: row.id,
        payload: { propertyId: input.propertyId, contactId: input.contactId ?? null },
      });
      return { ok: true as const, artifactId: row.id };
    }),

  /** TRESA-08: competing-offer CONTENT requires written seller direction. */
  discloseContent: authedQuery
    .input(z.object({
      propertyId: z.number(),
      sellerDirectionArtifactId: z.number().optional(),
      // Deprecated caller-asserted flag — accepted for backwards compatibility
      // but IGNORED by the policy gate (F8: not evidence of direction).
      writtenSellerDirection: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const store = getStore();
      const decision = await import("../policy/engine").then((m) => m.evaluateAction(store, { tenantId: scope.tenantId, actorId: scope.userId }, {
        kind: "offer.disclose_content",
        payload: { sellerDirectionArtifactId: input.sellerDirectionArtifactId, propertyId: input.propertyId },
        destination: `offer-room:property:${input.propertyId}`,
        idempotencyKey: `offer_disclose_${input.propertyId}_${scope.userId}`,
      }));
      if (decision.verdict !== "allow") {
        return { disclosed: false, verdict: decision.verdict, policyDecisionId: decision.decisionId, terms: [] as unknown[] };
      }
      const db = getDb();
      const offerRows = await db.select().from(s.offers).where(and(eq(s.offers.tenantId, scope.tenantId), eq(s.offers.propertyId, input.propertyId)));
      const terms = [];
      for (const o of offerRows) {
        terms.push(...await db.select().from(s.offerTerms).where(eq(s.offerTerms.offerId, o.id)));
      }
      return { disclosed: true, verdict: "allow", policyDecisionId: decision.decisionId, terms };
    }),
});
