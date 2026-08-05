import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const channelStateSchema = z.object({
  channel: z.string(),
  state: z.enum(["verified", "assumption", "missing", "expired", "suppressed"]),
  sendable: z.boolean(),
  reason: z.string(),
});
export const consentMapSchema = z.object({
  channels: z.array(channelStateSchema),
  anySendable: z.boolean(),
});
export type ConsentMap = z.infer<typeof consentMapSchema>;
export interface ConsentInput {
  consents: {
    channel: string;
    basis: "express" | "implied" | "none";
    capturedAt: string | Date;
    expiresAt?: string | Date | null;
    status: string;
  }[];
  suppressedChannels?: string[];
  now?: Date;
}

const CHANNELS = ["email", "sms", "voice", "dm"];

export const ConsentResolver: AgentDef<ConsentInput, ConsentMap> = {
  meta: { name: "ConsentResolver", promptVersion: "consent-resolver@1.0" },
  resultSchema: consentMapSchema,
  run(input) {
    const now = input.now ?? new Date();
    const suppressed = new Set(input.suppressedChannels ?? []);
    const channels = CHANNELS.map((channel) => {
      if (suppressed.has(channel))
        return { channel, state: "suppressed" as const, sendable: false, reason: "on suppression list (CASL-06 hard-block)" };
      const rows = input.consents
        .filter((c) => c.channel === channel)
        .sort((a, b) => +new Date(b.capturedAt) - +new Date(a.capturedAt));
      const c = rows[0];
      if (!c || c.basis === "none" || c.status === "withdrawn")
        return { channel, state: "missing" as const, sendable: false, reason: "no consent on record" };
      const expired = c.status === "expired" || (c.expiresAt && +new Date(c.expiresAt) <= +now);
      if (expired)
        return { channel, state: "expired" as const, sendable: false, reason: `${c.basis} consent expired — re-confirmation required (CASL-03)` };
      if (c.basis === "express")
        return { channel, state: "verified" as const, sendable: true, reason: "express consent active (CASL-02)" };
      return { channel, state: "assumption" as const, sendable: true, reason: `implied consent within window until ${new Date(c.expiresAt!).toISOString().slice(0, 10)} (CASL-03)` };
    });
    return agentResult(ConsentResolver.meta, { channels, anySendable: channels.some((c) => c.sendable) }, {
      confidence: 0.95,
      rationale: "Per-channel consent state resolved from latest records; expiry and suppression applied.",
      riskClass: "medium",
      autonomyLevel: "A1",
    });
  },
};
