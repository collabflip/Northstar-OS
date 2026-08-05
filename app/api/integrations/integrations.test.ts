import { describe, expect, it } from "vitest";
import { MockCommsProvider } from "./mockComms";
import { MockListingDataProvider } from "./mockListingData";
import { MockCalendarProvider } from "./mockCalendar";
import { NotConnectedRealtorDDF, type DdfAdapter } from "./ddf";
import { INTEGRATION_REGISTRY } from "./index";

describe("integrations", () => {
  it("REALTOR.ca DDF adapter: contract + truthful not_connected status", async () => {
    const ddf: DdfAdapter = new NotConnectedRealtorDDF();
    expect(ddf.name).toBe("realtor-ca-ddf");
    expect(ddf.status).toBe("not_connected");
    expect(ddf.isConnected()).toBe(false);
    expect(ddf.onboardingChecklist().length).toBeGreaterThanOrEqual(4);
    await expect(ddf.fetchListings({ city: "Toronto" })).rejects.toThrow(/not_connected/);
  });

  it("MockListingDataProvider: RESO shape, provenance per field, cursor sync", async () => {
    const p = new MockListingDataProvider();
    const first = await p.sync();
    expect(first.records.length).toBeGreaterThan(0);
    expect(first.status).toBe("mock");
    const r0 = first.records[0];
    expect(r0.ListingKey).toBeTruthy();
    expect(Object.keys(r0.provenance)).toContain("UnparsedAddress");
    expect(r0.provenance.UnparsedAddress.source).toBe("mock-board-feed");
    const second = await p.sync(first.nextCursor);
    expect(second.records).toHaveLength(0); // nothing newer than the cursor
    const partial = await p.sync("2026-05-01T00:00:00Z");
    expect(partial.records.every((r) => new Date(r.ModificationTimestamp) > new Date("2026-05-01T00:00:00Z"))).toBe(true);
  });

  it("MockCommsProvider: records sends, status mock, never claims delivery", async () => {
    const comms = new MockCommsProvider();
    const res = await comms.send({ channel: "email", to: "x@y.ca", body: "hi", idempotencyKey: "k_12345678" });
    expect(res.status).toBe("mock");
    expect(res.delivered).toBe(false);
    expect(res.note).toMatch(/MOCK/);
    expect(comms.sentLog).toHaveLength(1);
  });

  it("MockCalendarProvider: busy slots + event creation", async () => {
    const cal = new MockCalendarProvider();
    await cal.createEvent({ title: "Showing", start: "2026-06-12T14:00:00Z", end: "2026-06-12T15:00:00Z" });
    const busy = await cal.listBusy("2026-06-12T00:00:00Z", "2026-06-13T00:00:00Z");
    expect(busy).toHaveLength(1);
  });

  it("registry entries all carry truthful notes (no fake 'live' claims)", () => {
    expect(INTEGRATION_REGISTRY.length).toBe(5);
    for (const i of INTEGRATION_REGISTRY) {
      expect(["mock", "not_connected", "sandbox"]).toContain(i.status);
      expect(i.status).not.toBe("connected");
      expect(i.truthfulNote.length).toBeGreaterThan(10);
    }
  });
});
