/**
 * REALTOR.ca DDF adapter — interface + not-connected implementation.
 * Contract tests assert the interface shape; status is truthfully
 * "not_connected" until DDF credentials + data agreement are onboarded.
 */
import type { ResoLikeListing } from "./mockListingData";

export interface DdfAdapter {
  readonly name: string;
  readonly status: "not_connected" | "connected" | "degraded";
  readonly statusNote: string;
  isConnected(): boolean;
  fetchListings(criteria: { city?: string; since?: string }): Promise<ResoLikeListing[]>;
  onboardingChecklist(): string[];
}

export class NotConnectedRealtorDDF implements DdfAdapter {
  readonly name = "realtor-ca-ddf";
  readonly status = "not_connected" as const;
  readonly statusNote =
    "REALTOR.ca DDF not connected — requires CREA DDF data agreement + credentials. Interface and contract tests are in place.";
  isConnected() {
    return false;
  }
  async fetchListings(): Promise<ResoLikeListing[]> {
    throw new Error("REALTOR.ca DDF is not_connected — see onboardingChecklist()");
  }
  onboardingChecklist(): string[] {
    return [
      "Execute CREA DDF data agreement for the brokerage",
      "Provision DDF credentials (username/password) into secrets",
      "Configure destination feed + verify RESO schema mapping",
      "Run parity checks against MockListingDataProvider contract",
      "Flip status to connected only after broker-of-record sign-off",
    ];
  }
}
