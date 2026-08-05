import { createHash } from "node:crypto";
import type { AuditRecord, NewAuditEntry, Store } from "./store/types";

/** Deterministic JSON (sorted keys) so hashes are stable across runs. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function payloadHash(payload: unknown): string {
  return `sha256:${sha256(stableStringify(payload))}`;
}

export const GENESIS_HASH = "sha256:genesis";

/** DB-7: detect a duplicate-key error through drizzle's error wrapping. */
export function isDuplicateKeyError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur; depth++) {
    const e = cur as { code?: string; errno?: number; message?: string; cause?: unknown };
    if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) return true;
    if (typeof e.message === "string" && /duplicate entry/i.test(e.message)) return true;
    cur = e.cause;
  }
  return false;
}

// Retry-budget math (mirrors the appendWorkflowEvent fix, commit 2e6b579):
// the audit stress harness fires 5 simultaneous appends, so one insert can
// collide up to 4 times before it wins a seq; production bursts (parallel
// policy decisions, webhook+resume, batch approvals) can collide even more.
// 10 attempts tolerates 9 collisions — comfortably above the worst case —
// with small jittered backoff between attempts to de-synchronize writers.
// Measured before this change: 159/400 appends lost (dup-key escapes) at
// 5-way concurrency with the old budget of 3. The read-max-then-insert race
// window itself remains (absorbed, not removed) — the permanent cures
// (atomic per-tenant seq allocator / transactional FOR UPDATE) are roadmap.
const MAX_SEQ_RETRIES = 10;

/**
 * Append one entry to the tenant's audit hash chain.
 * hash = sha256(prevHash + canonical entry fields). Append-only by convention;
 * verification replays the chain.
 *
 * DB-7: seq allocation is read-max-then-insert, which races under concurrent
 * writers in one tenant. The (tenantId, seq) unique index is the arbiter: on
 * a duplicate-key conflict we re-read the tip and retry (bounded), so a
 * concurrent append never loses its audit row or 500s the request.
 */
export async function appendAudit(
  store: Store,
  entry: NewAuditEntry,
): Promise<AuditRecord> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
    const last = await store.getLastAudit(entry.tenantId);
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.hash ?? GENESIS_HASH;
    const pHash = payloadHash(entry.payload);
    const body = stableStringify({
      seq,
      tenantId: entry.tenantId,
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: String(entry.subjectId),
      payloadHash: pHash,
      policyDecisionId: entry.policyDecisionId ?? null,
      modelVersion: entry.modelVersion ?? null,
      promptVersion: entry.promptVersion ?? null,
      prevHash,
    });
    const hash = `sha256:${sha256(body)}`;
    try {
      return await store.appendAuditRow({
        seq,
        tenantId: entry.tenantId,
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        subjectType: entry.subjectType,
        subjectId: String(entry.subjectId),
        payloadHash: pHash,
        policyDecisionId: entry.policyDecisionId ?? null,
        modelVersion: entry.modelVersion ?? null,
        promptVersion: entry.promptVersion ?? null,
        prevHash,
        hash,
      });
    } catch (err) {
      // Only mask ER_DUP_ENTRY (concurrent writer won this seq — re-read the
      // tip and retry). Any other error propagates immediately.
      if (!isDuplicateKeyError(err)) throw err;
      lastError = err;
      if (attempt < MAX_SEQ_RETRIES - 1) {
        // 5–20ms random jitter before re-reading the tip and retrying.
        await new Promise((resolve) =>
          setTimeout(resolve, 5 + Math.floor(Math.random() * 16)),
        );
      }
    }
  }
  throw new Error(
    `appendAudit: exhausted ${MAX_SEQ_RETRIES} attempts for tenant ${entry.tenantId} — persistent seq collision on audit_tenant_seq (last error: ${lastError instanceof Error ? lastError.message : String(lastError)})`,
  );
}

/** Recompute the whole chain; returns the first broken seq if tampered. */
export function verifyAuditChain(rows: AuditRecord[]): {
  ok: boolean;
  brokenAtSeq?: number;
} {
  let prevHash = GENESIS_HASH;
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    if (row.prevHash !== prevHash) return { ok: false, brokenAtSeq: row.seq };
    const body = stableStringify({
      seq: row.seq,
      tenantId: row.tenantId,
      actorId: row.actorId ?? null,
      actorRole: row.actorRole ?? null,
      action: row.action,
      subjectType: row.subjectType,
      subjectId: String(row.subjectId),
      payloadHash: row.payloadHash,
      policyDecisionId: row.policyDecisionId ?? null,
      modelVersion: row.modelVersion ?? null,
      promptVersion: row.promptVersion ?? null,
      prevHash: row.prevHash,
    });
    const expected = `sha256:${sha256(body)}`;
    if (expected !== row.hash) return { ok: false, brokenAtSeq: row.seq };
    prevHash = row.hash;
  }
  return { ok: true };
}
