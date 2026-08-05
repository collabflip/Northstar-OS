import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const mediaQaResultSchema = z.object({
  approved: z.array(z.number()),
  rejected: z.array(z.object({ id: z.number(), reasons: z.array(z.string()) })),
});
export type MediaQaResult = z.infer<typeof mediaQaResultSchema>;
export interface MediaQaInput {
  assets: { id: number; type: string; width: number; height: number; sizeBytes: number; blurScore?: number }[];
}

const ALLOWED_TYPES = new Set(["photo", "floorplan", "video"]);

export const MediaQA: AgentDef<MediaQaInput, MediaQaResult> = {
  meta: { name: "MediaQA", promptVersion: "media-qa@1.0" },
  resultSchema: mediaQaResultSchema,
  run(input) {
    const approved: number[] = [];
    const rejected: MediaQaResult["rejected"] = [];
    for (const a of input.assets) {
      const reasons: string[] = [];
      if (!ALLOWED_TYPES.has(a.type)) reasons.push(`unsupported type ${a.type}`);
      if (a.type === "photo" && a.width < 1200) reasons.push(`width ${a.width}px < 1200px minimum`);
      if ((a.blurScore ?? 0) > 0.6) reasons.push(`blur score ${a.blurScore} > 0.6`);
      if (a.sizeBytes < 50_000) reasons.push("suspiciously small file (<50KB)");
      if (reasons.length) rejected.push({ id: a.id, reasons });
      else approved.push(a.id);
    }
    return agentResult(MediaQA.meta, { approved, rejected }, {
      confidence: 0.9,
      rationale: `${approved.length} asset(s) passed technical QA; ${rejected.length} rejected with reasons.`,
      autonomyLevel: "A1",
    });
  },
};
