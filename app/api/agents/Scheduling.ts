import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const schedulingResultSchema = z.object({
  proposals: z.array(z.object({ start: z.string(), end: z.string(), conflicts: z.boolean() })),
  recommended: z.string().nullable(),
});
export type SchedulingResult = z.infer<typeof schedulingResultSchema>;
export interface SchedulingInput {
  durationMin: number;
  requested: string[]; // ISO starts
  busy: { start: string; end: string }[];
  calendarEventTitle?: string;
}

export const Scheduling: AgentDef<SchedulingInput, SchedulingResult> = {
  meta: { name: "Scheduling", promptVersion: "scheduling@1.0" },
  resultSchema: schedulingResultSchema,
  run(input) {
    const overlaps = (s: number, e: number) =>
      input.busy.some((b) => s < +new Date(b.end) && e > +new Date(b.start));
    const proposals = input.requested.map((startIso) => {
      const s = +new Date(startIso);
      const e = s + input.durationMin * 60_000;
      return { start: startIso, end: new Date(e).toISOString(), conflicts: overlaps(s, e) };
    });
    const recommended = proposals.find((p) => !p.conflicts)?.start ?? null;
    return agentResult(Scheduling.meta, { proposals, recommended }, {
      confidence: 0.9,
      rationale: recommended ? `Earliest conflict-free slot ${recommended}.` : "All requested slots conflict — propose alternatives.",
      proposedAction: recommended
        ? { kind: "calendar.book", payload: { start: recommended, durationMin: input.durationMin, title: input.calendarEventTitle ?? "Appointment" }, destination: "calendar:mock" }
        : null,
      requiresHumanApproval: true,
      autonomyLevel: "A2",
    });
  },
};
