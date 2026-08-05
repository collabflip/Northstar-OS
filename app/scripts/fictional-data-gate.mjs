#!/usr/bin/env node
/**
 * fictional-data-gate.mjs — release-mandate data decontamination gate.
 *
 * Scans all git-tracked files for:
 *   1. Banned tokens (case-insensitive): the 10 real Toronto street names,
 *      harbourline.ca, maya.chen@harbourline.ca
 *   2. Non-555 North-American phone patterns inside demo-data files
 *      (db/seed.ts, api/integrations/mockListingData.ts, evals/golden.ts):
 *      any match of /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/ is a
 *      violation UNLESS it is a 555-01XX number (contains "555-01", or the
 *      digit-normalized form contains "55501" for separator-less numbers).
 *
 * Skips: binary assets (*.png/*.jpg/*.jpeg), FINAL_GIT_DIFF.txt,
 * redteam/*.md historical reports, package-lock.json, and this script itself
 * (it contains the banned tokens as detection patterns).
 *
 * Exit 1 with file:line report on violation; exit 0 with
 * "fictional-data gate: clean" otherwise. No dependencies.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BANNED_TOKENS = [
  "wrenwood",
  "bessborough",
  "balliol",
  "soudan",
  "millstone",
  "argyle",
  "hillsdale",
  "merton",
  "manor road",
  "manor rd",
  "yonge",
  "harbourline.ca",
  "maya.chen@harbourline.ca",
];

const PHONE_RE = /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const DEMO_DATA_FILES = new Set([
  "db/seed.ts",
  "api/integrations/mockListingData.ts",
  "web/src/lib/mockListingData.ts", // legacy path, kept for safety
  "evals/golden.ts",
]);

const SKIP_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf"];
const SKIP_FILES = new Set([
  "FINAL_GIT_DIFF.txt",
  "package-lock.json",
  "scripts/fictional-data-gate.mjs",
  // detector file: contains banned tokens as its own pattern table by design
  // (same convention as the self-skip above; see scripts/delivery-scan.mjs)
  "scripts/delivery-scan.mjs",
]);

function isSkipped(path) {
  if (SKIP_FILES.has(path)) return true;
  if (SKIP_EXTS.some((ext) => path.toLowerCase().endsWith(ext))) return true;
  if (/^(.+\/)?redteam\/.+\.md$/i.test(path)) return true; // historical evidence reports
  return false;
}

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => !isSkipped(f));

const violations = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // unreadable (e.g. binary) — skip
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const token of BANNED_TOKENS) {
      if (lower.includes(token)) {
        violations.push(`${file}:${i + 1}: banned token "${token}": ${line.trim().slice(0, 120)}`);
      }
    }
    if (DEMO_DATA_FILES.has(file)) {
      for (const m of line.matchAll(PHONE_RE)) {
        const raw = m[0];
        const digits = raw.replace(/\D/g, "");
        if (!raw.includes("555-01") && !digits.includes("55501")) {
          violations.push(`${file}:${i + 1}: non-555 phone number "${raw}" (must be +1-XXX-555-01XX)`);
        }
      }
    }
  });
}

if (violations.length > 0) {
  console.error("fictional-data gate: VIOLATIONS FOUND");
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("fictional-data gate: clean");
process.exit(0);
