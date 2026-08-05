// ci-migrate-proof.mjs — CI migration proof (independent-audit remediation).
//
// Proves the COMMITTED migrations (db/migrations) are the working schema
// source — `db:push` is prohibited in CI (TiDB truncate-prompt hazard; see
// docs/deployment-guide.md §1). Against the database named by DATABASE_URL:
//   1. npm run db:migrate            (must exit 0)
//   2. insert proof rows: tenant id 999001 (unique name slug) + one audit_log
//      row (action 'ci.migrate.proof'), hash-chained like api/audit.ts
//   3. npm run db:migrate AGAIN      (must exit 0 — no-op on applied journal)
//   4. assert the proof audit row survived and the information_schema table
//      count is unchanged between the two migrate runs
//   5. cleanup: DELETE the proof rows (never DROP the database — the CI mysql
//      service is ephemeral, and locally the shared dev DB must be left as found)
//   6. print a one-line proof summary, exit 0. Any failure → exit 1 naming
//      the failing step.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";

const TENANT_ID = 999001;
const TENANT_NAME = "ci-migrate-proof";
const PROOF_ACTION = "ci.migrate.proof";
const GENESIS_HASH = "sha256:genesis";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[ci-migrate-proof] FAIL step=preflight: DATABASE_URL is required");
  process.exit(1);
}

function fail(step, err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[ci-migrate-proof] FAIL step=${step}: ${msg}`);
  process.exitCode = 1;
}

// Deterministic JSON (sorted keys) — mirrors api/audit.ts stableStringify so
// the proof row is a structurally valid hash-chain entry.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function runMigrate(step) {
  // npm runs db:migrate (node scripts/db-migrate.mjs) against DATABASE_URL.
  execFileSync("npm", ["run", "db:migrate"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  console.log(`[ci-migrate-proof] ${step}: db:migrate exit 0`);
}

async function tableCount(conn) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  return Number(rows[0].n);
}

let conn;
try {
  // ── step 1: first migrate ───────────────────────────────────────────────
  try {
    runMigrate("migrate#1");
  } catch (err) {
    fail("migrate#1", err);
    throw err;
  }

  conn = await mysql.createConnection(databaseUrl);
  const tablesAfterFirst = await tableCount(conn);

  // ── step 2: insert proof rows ───────────────────────────────────────────
  try {
    // Idempotent re-entry: clear leftovers from a previous failed run.
    await conn.query("DELETE FROM audit_log WHERE tenantId = ?", [TENANT_ID]);
    await conn.query("DELETE FROM tenants WHERE id = ?", [TENANT_ID]);

    await conn.query(
      "INSERT INTO tenants (id, name, kind, province, timezone, policyPackVersion, brokeragePolicyVersion, autonomyCeiling, dnclPosture) VALUES (?, ?, 'brokerage', 'ON', 'America/Toronto', '2026.1', '2.3', 'A2', 'standard')",
      [TENANT_ID, TENANT_NAME],
    );

    // seq allocation mirrors api/audit.ts: max(seq)+1 per tenant (fresh
    // tenant → seq 1), prevHash genesis, hash over canonical entry fields.
    const [lastRows] = await conn.query(
      "SELECT MAX(seq) AS maxSeq FROM audit_log WHERE tenantId = ?",
      [TENANT_ID],
    );
    const seq = (lastRows[0].maxSeq ?? 0) + 1;
    const prevHash = GENESIS_HASH;
    const payloadHash = `sha256:${sha256(stableStringify({ proof: "ci.migrate.proof", tenantId: TENANT_ID }))}`;
    const body = stableStringify({
      seq,
      tenantId: TENANT_ID,
      actorId: null,
      actorRole: null,
      action: PROOF_ACTION,
      subjectType: "ci",
      subjectId: String(TENANT_ID),
      payloadHash,
      policyDecisionId: null,
      modelVersion: null,
      promptVersion: null,
      prevHash,
    });
    const hash = `sha256:${sha256(body)}`;
    await conn.query(
      "INSERT INTO audit_log (seq, tenantId, actorId, actorRole, action, subjectType, subjectId, payloadHash, policyDecisionId, modelVersion, promptVersion, prevHash, hash) VALUES (?, ?, NULL, NULL, ?, 'ci', ?, ?, NULL, NULL, NULL, ?, ?)",
      [seq, TENANT_ID, PROOF_ACTION, String(TENANT_ID), payloadHash, prevHash, hash],
    );
    console.log(`[ci-migrate-proof] insert: tenant ${TENANT_ID} + audit row seq=${seq} action=${PROOF_ACTION}`);
  } catch (err) {
    fail("insert-proof-rows", err);
    throw err;
  }

  // ── step 3: second migrate (must be a no-op) ────────────────────────────
  try {
    runMigrate("migrate#2");
  } catch (err) {
    fail("migrate#2", err);
    throw err;
  }

  // ── step 4: assertions ──────────────────────────────────────────────────
  try {
    const [proofRows] = await conn.query(
      "SELECT COUNT(*) AS n FROM audit_log WHERE tenantId = ? AND action = ?",
      [TENANT_ID, PROOF_ACTION],
    );
    if (Number(proofRows[0].n) !== 1) {
      throw new Error(`proof audit row missing after re-migrate (found ${proofRows[0].n})`);
    }
    const tablesAfterSecond = await tableCount(conn);
    if (tablesAfterSecond !== tablesAfterFirst) {
      throw new Error(
        `table count changed between migrate runs: ${tablesAfterFirst} → ${tablesAfterSecond}`,
      );
    }
    console.log(
      `[ci-migrate-proof] assert: audit row survived re-migrate; table count stable at ${tablesAfterSecond}`,
    );

    // ── step 6: summary (cleanup runs in finally) ─────────────────────────
    console.log(
      `[ci-migrate-proof] OK migrate×2 idempotent; audit proof row survived; tables=${tablesAfterSecond}; proof rows cleaned up`,
    );
  } catch (err) {
    fail("assert", err);
    throw err;
  }
} finally {
  // ── step 5: cleanup — delete proof rows only, NEVER drop the database ───
  if (conn) {
    try {
      // Always attempt: deletes are idempotent and also clear leftovers from
      // a previously failed run even if this run never reached the insert.
      await conn.query("DELETE FROM audit_log WHERE tenantId = ? AND action = ?", [
        TENANT_ID,
        PROOF_ACTION,
      ]);
      await conn.query("DELETE FROM tenants WHERE id = ?", [TENANT_ID]);
    } catch (err) {
      console.error(`[ci-migrate-proof] WARN cleanup failed: ${err.message}`);
      if (!process.exitCode) process.exitCode = 1;
    }
    await conn.end();
  }
}
