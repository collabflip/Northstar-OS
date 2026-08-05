/**
 * F1 — cross-tenant IDOR in valuations. Two-tenant tests against the live DB
 * (DrizzleStore path): guessing another tenant's dossier/property id must
 * return null; same-tenant access still works.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@db/schema";
import { valuationsRouter } from "./valuations";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;
let propertyA: number;
let dossierA: number;
let valuationA: number;
let comparableA: number;

beforeAll(async () => {
  fx = await createTwoTenantFixture("f1");
  propertyA = await fx.insert(s.properties, {
    tenantId: fx.tenantA,
    addressLine1: "1 IDOR Lane",
    city: "Ottawa",
    province: "ON",
    postalCode: "K1A0B1",
  });
  dossierA = await fx.insert(s.dossiers, {
    tenantId: fx.tenantA,
    propertyId: propertyA,
    status: "ready",
  });
  valuationA = await fx.insert(s.valuations, {
    tenantId: fx.tenantA,
    dossierId: dossierA,
    low: 900000,
    mid: 1000000,
    high: 1100000,
    disclaimer: "test",
  });
  comparableA = await fx.insert(s.comparables, {
    tenantId: fx.tenantA,
    dossierId: dossierA,
    address: "2 Comp Lane",
    soldPrice: 950000,
    soldDate: new Date("2026-01-15T00:00:00Z"),
  });
  expect(valuationA).toBeGreaterThan(0);
  expect(comparableA).toBeGreaterThan(0);
});

afterAll(async () => {
  await fx?.cleanup();
});

describe("F1 valuations cross-tenant IDOR", () => {
  it("tenant B cannot read tenant A's valuation by dossier id", async () => {
    const caller = valuationsRouter.createCaller(ctxFor(fx.userB));
    const result = await caller.latestByDossier({ dossierId: dossierA });
    expect(result).toBeNull();
  });

  it("tenant B cannot reach tenant A's dossier/valuation by property id", async () => {
    const caller = valuationsRouter.createCaller(ctxFor(fx.userB));
    const result = await caller.byProperty({ propertyId: propertyA });
    expect(result).toBeNull();
  });

  it("tenant A reads its own latest valuation by dossier id", async () => {
    const caller = valuationsRouter.createCaller(ctxFor(fx.userA));
    const result = await caller.latestByDossier({ dossierId: dossierA });
    expect(result?.id).toBe(valuationA);
    expect(result?.tenantId).toBe(fx.tenantA);
  });

  it("tenant A reads its own valuation by property id", async () => {
    const caller = valuationsRouter.createCaller(ctxFor(fx.userA));
    const result = await caller.byProperty({ propertyId: propertyA });
    expect(result?.id).toBe(valuationA);
  });
});
