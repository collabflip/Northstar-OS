/**
 * MockListingDataProvider — RESO-aligned fixture records with field-level
 * provenance and a sync cursor. Truthful: mock board feed, not MLS/CREA data.
 */
export interface ResoLikeListing {
  ListingKey: string;
  StandardStatus: "Active" | "Sold" | "Expired";
  UnparsedAddress: string;
  City: string;
  PostalCode: string;
  BedroomsTotal: number;
  BathroomsTotalInteger: number;
  LivingArea: number;
  ListPrice?: number;
  ClosePrice?: number;
  CloseDate?: string;
  ModificationTimestamp: string;
}

export interface ListingSyncResult {
  records: (ResoLikeListing & { provenance: Record<string, { source: string; retrievedAt: string }> })[];
  nextCursor: string;
  freshness: string;
  status: "mock";
}

const RETRIEVED = "2026-06-08T14:00:00.000Z";

export const MOCK_LISTINGS: ResoLikeListing[] = [
  { ListingKey: "HLD-2041", StandardStatus: "Active", UnparsedAddress: "DEMO-ON-PROPERTY-001", City: "Toronto", PostalCode: "M0M 0M0", BedroomsTotal: 4, BathroomsTotalInteger: 3, LivingArea: 2380, ListPrice: 1849000, ModificationTimestamp: "2026-06-04T09:00:00Z" },
  { ListingKey: "HLD-1187", StandardStatus: "Sold", UnparsedAddress: "DEMO-ON-AVENUE-001", City: "Toronto", PostalCode: "M0M 0M0", BedroomsTotal: 4, BathroomsTotalInteger: 3, LivingArea: 2310, ClosePrice: 1290000, CloseDate: "2026-05-12", ModificationTimestamp: "2026-05-13T10:00:00Z" },
  { ListingKey: "HLD-1202", StandardStatus: "Sold", UnparsedAddress: "DEMO-ON-STREET-001", City: "Toronto", PostalCode: "M0M 0M0", BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1950, ClosePrice: 1150000, CloseDate: "2026-04-28", ModificationTimestamp: "2026-04-29T10:00:00Z" },
  { ListingKey: "HLD-0915", StandardStatus: "Expired", UnparsedAddress: "DEMO-ON-PROPERTY-001", City: "Toronto", PostalCode: "M0M 0M0", BedroomsTotal: 4, BathroomsTotalInteger: 3, LivingArea: 2380, ListPrice: 1695000, ModificationTimestamp: "2019-09-01T10:00:00Z" },
];

export class MockListingDataProvider {
  readonly name = "mock-listing-data";
  readonly statusNote = "MOCK RESO-aligned fixture feed — not MLS/CREA data.";

  async sync(cursor?: string): Promise<ListingSyncResult> {
    const since = cursor ? new Date(cursor) : new Date(0);
    const records = MOCK_LISTINGS
      .filter((l) => new Date(l.ModificationTimestamp) > since)
      .map((l) => ({
        ...l,
        provenance: Object.fromEntries(
          Object.entries(l).map(([k]) => [k, { source: "mock-board-feed", retrievedAt: RETRIEVED }]),
        ),
      }));
    const newest = records.map((r) => r.ModificationTimestamp).sort().at(-1) ?? cursor ?? new Date(0).toISOString();
    return { records, nextCursor: newest, freshness: RETRIEVED, status: "mock" };
  }
}
