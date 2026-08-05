#!/usr/bin/env node
/**
 * secret-scan — zero-dependency committed-secret gate (release mandate P1).
 *
 * Scans every git-tracked file (via `git ls-files`) for:
 *   1. PEM private-key blocks (RSA/EC/OPENSSH/PGP/generic PRIVATE KEY)
 *   2. `APP_SECRET=<value>` where the value is not an obvious placeholder
 *      (placeholders match /ci-test|test|placeholder|change-me|your-|xxx/i
 *      or are empty — e.g. `.env.example` and CI test values pass)
 *   3. `mysql://user:password@host/...` URLs whose host is not localhost/
 *      127.0.0.1/::1 and not a CI host, with a non-placeholder password
 *   4. AWS-style access key IDs (AKIA[0-9A-Z]{16})
 *
 * Skips: binary assets (png/jpg/jpeg/webp/gif/woff/woff2/ico), package-lock.json,
 * FINAL_GIT_DIFF.txt, and itself (its regex sources would self-match).
 *
 * Exit 1 with file:line evidence on any hit; exit 0 prints "secret scan: clean".
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SKIP_EXTENSIONS = /\.(png|jpe?g|webp|gif|woff2?|ico)$/i;
const SKIP_FILES = new Set([
  "package-lock.json",
  "FINAL_GIT_DIFF.txt",
  "scripts/secret-scan.mjs", // self-exclusion: pattern sources below would self-match
]);

const PLACEHOLDER = /^(|.*(ci[-_]?test|test|placeholder|change-me|your-|xxx|example).*)$/i;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|.*\bci\b.*|.*-ci(\..*)?)$/i;

const RULES = [
  {
    id: "private-key-block",
    re: /-----BEGIN ((RSA|EC|OPENSSH|PGP) )?PRIVATE KEY( BLOCK)?-----/,
    describe: () => "PEM private key material committed",
  },
  {
    id: "app-secret",
    re: /APP_SECRET\s*=\s*("([^"]*)"|'([^']*)'|([^\s#]+))/,
    describe: (m) => {
      const value = m[2] ?? m[3] ?? m[4] ?? "";
      return PLACEHOLDER.test(value)
        ? null
        : `APP_SECRET assigned a non-placeholder value (${value.slice(0, 4)}…)`;
    },
  },
  {
    id: "mysql-url",
    re: /mysql:\/\/([^:/\s]+):([^@/\s]+)@([^/\s:]+)/,
    describe: (m) => {
      const [, , password, host] = m;
      if (LOCAL_HOST.test(host)) return null;
      if (PLACEHOLDER.test(password)) return null;
      return `mysql:// URL with non-local host (${host}) and a real-looking password`;
    },
  },
  {
    id: "aws-access-key",
    re: /AKIA[0-9A-Z]{16}/,
    describe: () => "AWS-style access key ID (AKIA…)",
  },
];

function trackedFiles() {
  const out = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && !SKIP_FILES.has(f) && !SKIP_EXTENSIONS.test(f));
}

let violations = 0;
let scanned = 0;

for (const file of trackedFiles()) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // unreadable (e.g. binary despite extension) — skip
  }
  if (content.includes("\0")) continue; // binary guard
  scanned++;
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      const m = line.match(rule.re);
      if (!m) continue;
      const problem = rule.describe(m);
      if (!problem) continue;
      violations++;
      console.error(`secret-scan: ${file}:${i + 1}: [${rule.id}] ${problem}`);
    }
  });
}

if (violations > 0) {
  console.error(`secret scan: ${violations} violation(s) across ${scanned} tracked files`);
  process.exit(1);
}
console.log(`secret scan: clean (${scanned} tracked files scanned)`);
process.exit(0);
