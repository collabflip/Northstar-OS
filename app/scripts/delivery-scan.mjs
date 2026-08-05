#!/usr/bin/env node
/**
 * delivery-scan.mjs — public-delivery banned-identifier scanner (consent order
 * + independent-audit remediation).
 *
 * Usage: node scripts/delivery-scan.mjs <root> [--include-internal]
 *
 * Recursively walks <root> and scans every text file line-by-line for banned
 * real-world identifiers (case-insensitive):
 *   - street tokens: wrenwood, bessborough, balliol, soudan, millstone,
 *     argyle, hillsdale, merton, "manor rd", "manor road", yonge
 *   - the real domain: /harbourline\.ca(?![a-z])/i (harbourline.cafe etc. OK)
 *   - the real mailbox: maya.chen@harbourline.ca
 *   - phone regex /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/ flagged
 *     ONLY when the match is NOT in the fictional 555-01XX range. Following
 *     the scripts/fictional-data-gate.mjs convention, "in range" means the
 *     raw match contains "555-01" OR its digit-normalized form contains
 *     "55501" (seed stores numbers separator-less, e.g. +14165550111).
 *     Matches embedded in a longer alphanumeric run (hex hashes, 13-digit
 *     epoch-ms timestamps) and all-zero placeholders (000000-0000) are not
 *     dialable phone numbers and are not flagged.
 *
 * `.zip` files are inspected as archives: entries listed via `unzip -Z1` and
 * text entries scanned via `unzip -p`; findings are labelled `zip!entry:line`.
 *
 * NO directory exemptions by default — redteam/ and historical files are IN
 * scope for the public scan (the audit's core demand). Default skip list
 * (non-delivery artifacts, not exemptions): any `node_modules`, `.git`, and
 * `app/` (the working tree is delivered only as the release source ZIP, which
 * is scanned as a nested archive — release/northstar-selleros-source.zip is
 * NOT skipped). `--include-internal` additionally scans an `internal/`
 * subtree if present (quarantined pre-decontamination records).
 *
 * Detector self-reference guard (NOT a content exemption): the two scanner
 * scripts — scripts/delivery-scan.mjs (this file) and
 * scripts/fictional-data-gate.mjs — are skipped wherever they appear,
 * including inside archives, because they contain the banned tokens as
 * detection patterns by design (same convention the fictional-data gate
 * uses for itself). Every other file, including all of redteam/ and all
 * archive entries, is scanned.
 *
 * Exit 1 with a full finding report on any violation; exit 0 printing
 * "delivery scan: clean (N files scanned, M archives inspected)" otherwise.
 * No dependencies.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--"));
const includeInternal = args.includes("--include-internal");

if (!root) {
  console.error("usage: node scripts/delivery-scan.mjs <root> [--include-internal]");
  process.exit(2);
}

const TOKEN_PATTERNS = [
  ["street token", /wrenwood/i],
  ["street token", /bessborough/i],
  ["street token", /balliol/i],
  ["street token", /soudan/i],
  ["street token", /millstone/i],
  ["street token", /argyle/i],
  ["street token", /hillsdale/i],
  ["street token", /merton/i],
  ["street token", /manor rd/i],
  ["street token", /manor road/i],
  ["street token", /yonge/i],
  ["real domain", /harbourline\.ca(?![a-z])/i],
  ["real mailbox", /maya\.chen@harbourline\.ca/i],
];
// Boundary guards exclude digit runs embedded in longer alphanumeric tokens
// (SHA-256 hex, epoch timestamps); they are not standalone phone numbers.
const PHONE_RE = /(?<![A-Za-z0-9])\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?![0-9])/g;

const BINARY_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".woff", ".woff2", ".ico", ".mp3", ".mp4"];
const SKIP_DIRS = new Set(["node_modules", ".git", "app"]);
// Detector scripts contain the banned tokens as detection patterns by design.
const DETECTOR_SUFFIXES = ["scripts/delivery-scan.mjs", "scripts/fictional-data-gate.mjs"];

const findings = [];
let filesScanned = 0;
let archivesInspected = 0;

function isBinaryName(name) {
  const lower = name.toLowerCase();
  return BINARY_EXTS.some((ext) => lower.endsWith(ext));
}

function scanText(text, label) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    for (const [kind, re] of TOKEN_PATTERNS) {
      const m = line.match(re);
      if (m) {
        findings.push(`${label}:${lineNo}: banned ${kind} "${m[0]}": ${line.trim().slice(0, 120)}`);
      }
    }
    for (const m of line.matchAll(PHONE_RE)) {
      const raw = m[0];
      const digits = raw.replace(/\D/g, "");
      if (raw.includes("555-01") || digits.includes("55501")) continue; // fictional 555-01XX range
      if (/^0+$/.test(digits)) continue; // all-zero placeholder, not dialable
      findings.push(`${label}:${lineNo}: non-555 phone "${raw}" (only the fictional 555-01XX range is allowed)`);
    }
  });
  filesScanned += 1;
}

function scanZip(zipPath, label) {
  archivesInspected += 1;
  let entries;
  try {
    entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .map((e) => e.trim())
      .filter(Boolean);
  } catch (err) {
    findings.push(`${label}: archive unreadable (unzip -Z1 failed: ${err.message})`);
    return;
  }
  for (const entry of entries) {
    if (entry.endsWith("/")) continue; // directory entry
    if (isBinaryName(entry)) continue;
    if (DETECTOR_SUFFIXES.some((s) => entry.toLowerCase().endsWith(s))) continue;
    let text;
    try {
      text = execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch {
      continue; // unreadable entry — skip
    }
    scanText(text, `${label}!${entry}`);
  }
}

function walk(dir) {
  let items;
  try {
    items = readdirSync(dir);
  } catch {
    return;
  }
  for (const item of items) {
    const full = join(dir, item);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(item)) continue;
      if (item === "internal" && !includeInternal) continue;
      walk(full);
    } else if (st.isFile()) {
      if (isBinaryName(item)) continue;
      const rel = relative(root, full);
      if (DETECTOR_SUFFIXES.some((s) => rel.toLowerCase().endsWith(s))) continue;
      if (item.toLowerCase().endsWith(".zip")) {
        scanZip(full, rel);
      } else {
        let text;
        try {
          text = readFileSync(full, "utf8");
        } catch {
          continue; // unreadable (e.g. binary) — skip
        }
        scanText(text, rel);
      }
    }
  }
}

walk(root);

if (findings.length > 0) {
  console.error(`delivery scan: VIOLATIONS FOUND (${findings.length})`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`delivery scan: clean (${filesScanned} files scanned, ${archivesInspected} archives inspected)`);
process.exit(0);
