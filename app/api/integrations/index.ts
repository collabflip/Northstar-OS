export { MockCommsProvider } from "./mockComms";
export { MockListingDataProvider, MOCK_LISTINGS, type ResoLikeListing } from "./mockListingData";
export { MockCalendarProvider } from "./mockCalendar";
export { NotConnectedRealtorDDF, type DdfAdapter } from "./ddf";

/** Registry rows for the integrations table (truthful statuses). */
export const INTEGRATION_REGISTRY = [
  {
    name: "mock-comms",
    kind: "comms",
    status: "mock" as const,
    truthfulNote: "Mock email/SMS provider — sends recorded, never delivered. All sends policy-gated via outbox.",
    config: { channels: ["email", "sms"] },
  },
  {
    name: "mock-listing-data",
    kind: "listing_data",
    status: "mock" as const,
    truthfulNote: "Mock RESO-aligned fixture feed with field-level provenance + sync cursor. Not MLS/CREA data.",
    config: { fixtureCount: 4 },
  },
  {
    name: "mock-calendar",
    kind: "calendar",
    status: "mock" as const,
    truthfulNote: "Mock calendar — local events only, no external sync.",
    config: {},
  },
  {
    name: "realtor-ca-ddf",
    kind: "mls_ddf",
    status: "not_connected" as const,
    truthfulNote: "REALTOR.ca DDF adapter interface only — no credentials/data agreement. Onboarding checklist documented.",
    config: { onboarding: "see api/integrations/ddf.ts" },
  },
  {
    name: "model-gateway",
    kind: "model",
    status: "mock" as const,
    truthfulNote: "Model gateway defaults to MockDeterministicProvider. OpenAI-compatible endpoint configurable via env (unconfigured).",
    config: { provider: "mock-deterministic", optOutOfTraining: true },
  },
];
