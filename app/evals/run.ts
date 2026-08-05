/**
 * Eval runner — executes the golden scenario suite + seller-conversation
 * simulator, aggregates pass rates, and writes evals/report.md.
 *
 * Usage: `npm run evals` (tsx evals/run.ts). Exit code 1 if anything fails,
 * so CI and the definition-of-done gate stay honest.
 *
 * Determinism: fixed clock fixtures, MemoryStore, MockDeterministicProvider —
 * no live DB, no network, no live model. Re-runs are byte-stable except for
 * the generated-at timestamp and measured durations.
 */
import { writeFileSync } from "node:fs";
import { GOLDEN_SCENARIOS } from "./golden";
import { runSimulator } from "./simulator";
import {
  EVAL_CATEGORIES,
  type CategorySummary,
  type EvalReport,
  type ScenarioResult,
} from "./types";

/** Corrections made while building/hardening this harness (spec §13 report requirement). */
const CORRECTIONS: string[] = [
  "REAL FIX (api/policy/engine.ts): roleAllowed() evaluated the broker_of_record blanket-allow BEFORE the fintrac.* restriction, so a broker of record could file/review STRs — violating FIN-07's anti-tipping-off control (STR queue visible ONLY to fintrac_officer). Found by scenario fin-01; fixed by evaluating the fintrac restriction first; regression test added (engine.test.ts '3b').",
  "casl-06 fixture corrected during harness development: the expired implied-consent record must be the LATEST consent for the contact (capturedAt newer than the seeded express record), otherwise the gate correctly evaluates the newer express consent instead of the expired implied one under test.",
  "esc-08 fixture strengthened: SRP advice text now also carries a CEM signal so the scenario isolates the TRESA-04 block rather than tripping the unrelated CASL-01 ambiguity escalation first (verdict precedence verified: block beats escalate).",
  "docext-04/05/08 fixtures corrected: offer citation markers must use the supported [p.N §X.Y] grammar with numeric sections (§9.1, §9.3) — letters (§A.1) are outside the provenance-marker grammar and correctly ignored by the extractor.",
  "claims-02 fixture corrected: the 'supported' claim must use words entailed by the fact corpus ('beautiful' is not a property fact); replaced with a claim fully entailed by the corpus.",
];

/** Remaining limitations (honest residual risk — spec §13 report requirement). */
const LIMITATIONS: string[] = [
  "All scenarios run against MemoryStore fixtures and the MockDeterministicProvider — no live MySQL, no live LLM. DrizzleStore parity is covered by unit/integration tests, not by this suite.",
  "Agent cores are deterministic heuristics; scenario assertions validate guardrail behavior (fail-closed, escalation, grounding), not LLM fluency. Real-model quality requires a separate judged eval with a configured provider.",
  "The bilingual check is structural (key parity, non-empty translations, sample translations). The deterministic conversation core is EN-first: ungrounded French input fails closed rather than answering (sim-06), which is safe but not yet a bilingual experience.",
  "Latency thresholds (25ms gate median, 500ms/200 turns) are smoke budgets on in-memory fixtures, not production SLOs; they catch regressions, not capacity limits.",
  "Prompt-injection/exfiltration coverage is lexicon-based; a motivated attacker with novel phrasing may evade it. The defense-in-depth layers (untrusted-content delimiter, tool allowlist, never-admit list, output scan) are each tested individually.",
  "The simulator scripts 8 personas x 2-4 turns. Coverage of long-horizon conversations, multi-party threads and channel-specific quirks (SMS length, DM threading) is future work.",
];

async function runScenario(s: (typeof GOLDEN_SCENARIOS)[number]): Promise<ScenarioResult> {
  const t0 = performance.now();
  try {
    const o = await s.run();
    return {
      id: s.id, category: s.category, ruleIds: s.ruleIds ?? [], title: s.title,
      pass: o.pass, expected: o.expected, actual: o.actual, notes: o.notes,
      durationMs: performance.now() - t0,
    };
  } catch (err) {
    return {
      id: s.id, category: s.category, ruleIds: s.ruleIds ?? [], title: s.title,
      pass: false, expected: "scenario completes without throwing",
      actual: `THREW: ${(err as Error).message}`,
      durationMs: performance.now() - t0,
    };
  }
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

function renderMarkdown(report: EvalReport): string {
  const L: string[] = [];
  L.push("# Northstar SellerOS — Evaluation Report");
  L.push("");
  L.push(`Generated: ${report.generatedAt} · Duration: ${(report.durationMs / 1000).toFixed(1)}s`);
  L.push("");
  L.push("**Harness:** deterministic golden scenarios + seller-conversation simulator over the real policy kernel, agent cores, model gateway and workflow runner (MemoryStore fixtures, mock provider, fixed clocks — no live DB, network or model). Spec §13.");
  L.push("");
  L.push("## Overall");
  L.push("");
  L.push(`- Golden scenarios: **${report.totals.passed}/${report.totals.scenarios} passed (${report.totals.passRatePct}%)**`);
  L.push(`- Simulator: ${report.simulator.conversations} conversations, **${report.simulator.passed}/${report.simulator.checks} invariant checks passed**`);
  L.push(`- Verdict: **${report.totals.failed === 0 && report.simulator.failed === 0 ? "CLEAN — no failures" : `${report.totals.failed + report.simulator.failed} FAILURE(S)`}**`);
  L.push("");
  L.push("## Pass rates by spec §13 category");
  L.push("");
  L.push("| Category | Scenarios | Passed | Pass rate |");
  L.push("|---|---|---|---|");
  for (const c of report.categories) {
    const label = c.category === "seller_conversation_simulator" ? "seller-conversation simulator" : c.category.replace(/_/g, " ");
    L.push(`| ${label} | ${c.total} | ${c.passed} | ${c.passRatePct}% |`);
  }
  L.push("");
  L.push("## Representative failures");
  L.push("");
  if (report.failures.length === 0 && report.simulator.failed === 0) {
    L.push("None — every golden scenario and every simulator invariant passed on this run.");
  } else {
    for (const f of report.failures.slice(0, 20)) {
      L.push(`- **${f.id}** (${f.category}) ${f.title}`);
      L.push(`  - expected: ${f.expected}`);
      L.push(`  - actual: ${f.actual}`);
    }
    for (const s of report.simReports) {
      for (const c of s.checks.filter((x) => !x.pass).slice(0, 10))
        L.push(`- **${s.id} turn ${c.turn}** (${c.check}): ${c.detail}`);
    }
  }
  L.push("");
  L.push("## Corrections made");
  L.push("");
  for (const c of CORRECTIONS) L.push(`- ${c}`);
  L.push("");
  L.push("## Remaining limitations");
  L.push("");
  for (const l of LIMITATIONS) L.push(`- ${l}`);
  L.push("");
  L.push("## Simulator transcripts (representative excerpts)");
  L.push("");
  for (const s of report.simReports) {
    const passed = s.checks.filter((c) => c.pass).length;
    L.push(`### ${s.id} — ${s.title}`);
    L.push("");
    L.push(`_${s.persona}_ — ${passed}/${s.checks.length} checks passed.`);
    L.push("");
    for (const t of s.transcript.slice(0, 8)) {
      const who = t.speaker === "seller" ? "**Seller**" : "**Assistant**";
      L.push(`> ${who}: ${t.text.replace(/\n/g, " ").slice(0, 220)}`);
      L.push(">");
    }
    L.push("");
  }
  L.push("## Scenario inventory");
  L.push("");
  L.push("| id | category | rules | title | result |");
  L.push("|---|---|---|---|---|");
  for (const r of report.results)
    L.push(`| ${r.id} | ${r.category.replace(/_/g, " ")} | ${r.ruleIds.join(", ") || "—"} | ${r.title} | ${r.pass ? "pass" : "**FAIL**"} |`);
  L.push("");
  return L.join("\n");
}

async function main() {
  const t0 = performance.now();

  // suite integrity guards
  const ids = new Set<string>();
  const dupes: string[] = [];
  for (const s of GOLDEN_SCENARIOS) {
    if (ids.has(s.id)) dupes.push(s.id);
    ids.add(s.id);
  }
  if (dupes.length) throw new Error(`duplicate scenario ids: ${dupes.join(", ")}`);
  const uncovered = EVAL_CATEGORIES.filter((c) => !GOLDEN_SCENARIOS.some((s) => s.category === c));
  if (uncovered.length) throw new Error(`spec §13 categories without scenarios: ${uncovered.join(", ")}`);
  if (GOLDEN_SCENARIOS.length < 100)
    throw new Error(`spec §13 requires ≥100 golden scenarios — found ${GOLDEN_SCENARIOS.length}`);

  const results: ScenarioResult[] = [];
  for (const s of GOLDEN_SCENARIOS) results.push(await runScenario(s));

  const simReports = runSimulator();
  const simChecks = simReports.flatMap((s) => s.checks);
  const simPassed = simChecks.filter((c) => c.pass).length;

  const categories: CategorySummary[] = EVAL_CATEGORIES.map((category) => {
    const rows = results.filter((r) => r.category === category);
    const passed = rows.filter((r) => r.pass).length;
    return { category, total: rows.length, passed, failed: rows.length - passed, passRatePct: pct(passed, rows.length) };
  });
  categories.push({
    category: "seller_conversation_simulator",
    total: simChecks.length, passed: simPassed, failed: simChecks.length - simPassed,
    passRatePct: pct(simPassed, simChecks.length),
  });

  const passed = results.filter((r) => r.pass).length;
  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    totals: {
      scenarios: results.length, passed, failed: results.length - passed,
      passRatePct: pct(passed, results.length),
    },
    simulator: {
      conversations: simReports.length, checks: simChecks.length,
      passed: simPassed, failed: simChecks.length - simPassed,
    },
    categories,
    results,
    failures: results.filter((r) => !r.pass),
    simReports,
    durationMs: performance.now() - t0,
  };

  writeFileSync(new URL("./report.md", import.meta.url), renderMarkdown(report));

  // console summary
  console.log(`\nNorthstar SellerOS evals — ${report.generatedAt}`);
  console.log(`golden scenarios: ${passed}/${results.length} passed (${report.totals.passRatePct}%)`);
  console.log(`simulator:        ${simPassed}/${simChecks.length} checks passed across ${simReports.length} conversations`);
  for (const c of report.categories)
    console.log(`  ${c.passRatePct === 100 ? "✓" : "✗"} ${c.category.padEnd(32)} ${c.passed}/${c.total}`);
  if (report.failures.length) {
    console.log("\nFAILURES:");
    for (const f of report.failures) console.log(`  ✗ ${f.id} ${f.title}\n    expected: ${f.expected}\n    actual:   ${f.actual}`);
  }
  const simFailures = simChecks.filter((c) => !c.pass);
  if (simFailures.length) {
    console.log("\nSIMULATOR FAILURES:");
    for (const f of simFailures) console.log(`  ✗ ${f.conversationId} turn ${f.turn} ${f.check}: ${f.detail}`);
  }
  console.log(`\nreport written to evals/report.md (${(report.durationMs / 1000).toFixed(1)}s)`);

  if (report.totals.failed > 0 || report.simulator.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`evals runner failed: ${(err as Error).stack ?? err}`);
  process.exitCode = 1;
});
