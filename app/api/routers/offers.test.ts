/**
 * F8 — TRESA-08 written-seller-direction. The gate requires a persisted
 * seller_direction_artifacts row in the same tenant; caller-asserted booleans
 * are ignored.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { offersRouter } from "./offers";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;
let propertyA: number;

beforeAll(async () => {
  fx = await createTwoTenantFixture("f8");
  propertyA = await fx.insert(s.properties, {
    tenantId: fx.tenantA,
    addressLine1: "42 Tresa Cres",
    city: "Toronto",
    province: "ON",
    postalCode: "M4B1B3",
  });
});

afterAll(async () => {
  const db = getDb();
  await db.delete(s.sellerDirectionArtifacts).where(eq(s.sellerDirectionArtifacts.tenantId, fx.tenantA));
  await db.delete(s.sellerDirectionArtifacts).where(eq(s.sellerDirectionArtifacts.tenantId, fx.tenantB));
  await db.delete(s.properties).where(eq(s.properties.tenantId, fx.tenantB));
  await db.delete(s.policyDecisions).where(eq(s.policyDecisions.tenantId, fx.tenantA));
  await db.delete(s.auditLog).where(eq(s.auditLog.tenantId, fx.tenantA));
  await fx?.cleanup();
});

describe("F8 TRESA-08 seller direction artifacts", () => {
  it("caller-asserted writtenSellerDirection without an artifact → blocked", async () => {
    const caller = offersRouter.createCaller(ctxFor(fx.userA));
    const res = await caller.discloseContent({ propertyId: propertyA, writtenSellerDirection: true });
    expect(res.disclosed).toBe(false);
    expect(res.verdict).toBe("block");
    const [decision] = await getDb().select().from(s.policyDecisions).where(
      and(eq(s.policyDecisions.tenantId, fx.tenantA), eq(s.policyDecisions.id, res.policyDecisionId)),
    );
    expect(decision.ruleIds).toContain("TRESA-08");
  });

  it("recordSellerDirection persists a tenant-scoped artifact", async () => {
    const caller = offersRouter.createCaller(ctxFor(fx.userA));
    const res = await caller.recordSellerDirection({
      propertyId: propertyA,
      signedEvidenceText: "Seller Pelletier directs disclosure of competing offer content (signed 2026-06-01).",
    });
    expect(res.artifactId).toBeGreaterThan(0);
    const [row] = await getDb().select().from(s.sellerDirectionArtifacts).where(eq(s.sellerDirectionArtifacts.id, res.artifactId));
    expect(row.tenantId).toBe(fx.tenantA);
    expect(row.status).toBe("pending");
  });

  it("valid same-tenant artifact → disclosure allowed", async () => {
    const caller = offersRouter.createCaller(ctxFor(fx.userA));
    const { artifactId } = await caller.recordSellerDirection({
      propertyId: propertyA,
      signedEvidenceText: "Written direction on file.",
    });
    const res = await caller.discloseContent({ propertyId: propertyA, sellerDirectionArtifactId: artifactId });
    expect(res.verdict).toBe("allow");
    expect(res.disclosed).toBe(true);
  });

  it("another tenant's artifact id does not satisfy the control", async () => {
    const [propB] = await getDb().insert(s.properties).values({
      tenantId: fx.tenantB,
      addressLine1: "7 Other St",
      city: "Toronto",
      province: "ON",
      postalCode: "M4C1C4",
    }).$returningId();
    const foreignArtifact = await fx.insert(s.sellerDirectionArtifacts, {
      tenantId: fx.tenantB,
      propertyId: propB.id,
      signedEvidenceText: "Tenant B direction.",
      status: "verified",
    });
    const caller = offersRouter.createCaller(ctxFor(fx.userA));
    const res = await caller.discloseContent({ propertyId: propertyA, sellerDirectionArtifactId: foreignArtifact });
    expect(res.disclosed).toBe(false);
    expect(res.verdict).toBe("block");
  });
});
