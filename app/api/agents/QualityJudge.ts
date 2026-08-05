import { z } from "zod";
import { humanRightsLint } from "../policy/controls";
import { agentResult, type AgentDef } from "./types";

export const judgeResultSchema = z.object({
  scores: z.array(z.object({ dimension: z.string(), score: z.number(), note: z.string() })),
  overall: z.number(),
  pass: z.boolean(),
});
export type JudgeResult = z.infer<typeof judgeResultSchema>;
export interface JudgeInput {
  artifact: { text?: string; evidenceIds?: string[]; facts?: string[] };
  rubric: { dimensions: { name: string; weight: number; check: "has_evidence" | "no_hr_violations" | "has_disclaimer" | "grounded_numbers" | "non_empty" }[] };
  passThreshold?: number;
}

export const QualityJudge: AgentDef<JudgeInput, JudgeResult> = {
  meta: { name: "QualityJudge", promptVersion: "quality-judge@1.0" },
  resultSchema: judgeResultSchema,
  run(input) {
    const a = input.artifact;
    const text = a.text ?? "";
    const scores = input.rubric.dimensions.map((d) => {
      switch (d.check) {
        case "has_evidence": {
          const ok = (a.evidenceIds?.length ?? 0) > 0;
          return { dimension: d.name, weight: d.weight, score: ok ? 1 : 0, note: ok ? `${a.evidenceIds!.length} evidence ref(s)` : "no evidence references" };
        }
        case "no_hr_violations": {
          const hits = humanRightsLint(text);
          return { dimension: d.name, weight: d.weight, score: hits.length ? 0 : 1, note: hits.length ? `${hits.length} HR violation(s)` : "clean" };
        }
        case "has_disclaimer": {
          const ok = /not an appraisal|aide à la décision|decision support/i.test(text);
          return { dimension: d.name, weight: d.weight, score: ok ? 1 : 0, note: ok ? "disclaimer present" : "missing disclaimer" };
        }
        case "grounded_numbers": {
          const nums = text.match(/\d[\d,]*/g) ?? [];
          const corpus = (a.facts ?? []).join(" ").toLowerCase();
          const bad = nums.filter((n) => !corpus.includes(n.toLowerCase()));
          return { dimension: d.name, weight: d.weight, score: bad.length ? 0 : 1, note: bad.length ? `${bad.length} ungrounded number(s): ${bad.join(", ")}` : "all numbers grounded" };
        }
        default: {
          const ok = text.trim().length > 0;
          return { dimension: d.name, weight: d.weight, score: ok ? 1 : 0, note: ok ? "non-empty" : "empty artifact" };
        }
      }
    });
    const totalW = scores.reduce((s, x) => s + x.weight, 0) || 1;
    const overall = Math.round((scores.reduce((s, x) => s + x.score * x.weight, 0) / totalW) * 100) / 100;
    const threshold = input.passThreshold ?? 0.8;
    return agentResult(QualityJudge.meta, {
      scores: scores.map(({ dimension, score, note }) => ({ dimension, score, note })),
      overall,
      pass: overall >= threshold,
    }, {
      confidence: 0.85,
      rationale: `Rubric score ${overall} vs threshold ${threshold} — ${overall >= threshold ? "pass" : "fail"}.`,
      riskClass: "low",
      autonomyLevel: "A1",
    });
  },
};
