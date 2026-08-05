import { and, desc, eq, gte, isNull, like } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { isDuplicateKeyError } from "../audit";
import type {
  ApprovalRecord,
  AuditRecord,
  ConsentRecordLite,
  ContactRecord,
  MembershipRecord,
  OutboxRecord,
  PolicyDecisionRecord,
  SellerDirectionArtifactRecord,
  Store,
  TenantRecord,
  WorkflowEventRecord,
  WorkflowRecord,
} from "./types";

/**
 * Production Store backed by MySQL via Drizzle (query API only — no raw SQL).
 * Every lookup is tenant-scoped; outbox enqueue dedupes on the unique
 * idempotencyKey (unique index + duplicate-key fallback).
 *
 * DB-5: `transaction()` binds a new store to a real SQL transaction handle —
 * multi-write flows (campaign launch, runner steps, drainer execution) commit
 * atomically or not at all.
 */
type DbHandle = ReturnType<typeof getDb>;

export class DrizzleStore implements Store {
  /** When set (inside transaction()), all queries run on that tx handle. */
  private readonly handle?: DbHandle;

  constructor(handle?: DbHandle) {
    this.handle = handle;
  }

  private db(): DbHandle {
    return this.handle ?? getDb();
  }

  async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    if (this.handle) return fn(this); // already inside a transaction
    return getDb().transaction((tx) => fn(new DrizzleStore(tx as unknown as DbHandle)));
  }

  async getTenant(tenantId: number): Promise<TenantRecord | undefined> {
    return this.db().query.tenants.findFirst({
      where: eq(s.tenants.id, tenantId),
    }) as Promise<TenantRecord | undefined>;
  }

  async getMembership(
    tenantId: number,
    userId: number,
  ): Promise<MembershipRecord | undefined> {
    return this.db().query.memberships.findFirst({
      where: and(
        eq(s.memberships.tenantId, tenantId),
        eq(s.memberships.userId, userId),
      ),
    }) as Promise<MembershipRecord | undefined>;
  }

  async getContact(
    tenantId: number,
    contactId: number,
  ): Promise<ContactRecord | undefined> {
    return this.db().query.contacts.findFirst({
      where: and(eq(s.contacts.tenantId, tenantId), eq(s.contacts.id, contactId)),
    }) as Promise<ContactRecord | undefined>;
  }

  async latestConsent(
    tenantId: number,
    contactId: number,
    channel: string,
  ): Promise<ConsentRecordLite | undefined> {
    const rows = await this.db()
      .select()
      .from(s.consentRecords)
      .where(
        and(
          eq(s.consentRecords.tenantId, tenantId),
          eq(s.consentRecords.contactId, contactId),
          eq(s.consentRecords.channel, channel as never),
        ),
      )
      .orderBy(desc(s.consentRecords.capturedAt))
      .limit(1);
    return rows[0] as ConsentRecordLite | undefined;
  }

  async isSuppressed(
    tenantId: number,
    contactId: number,
    channel: string,
  ): Promise<boolean> {
    const rows = await this.db()
      .select({ id: s.suppressionList.id })
      .from(s.suppressionList)
      .where(
        and(
          eq(s.suppressionList.tenantId, tenantId),
          eq(s.suppressionList.contactId, contactId),
          eq(s.suppressionList.channel, channel as never),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async getApproval(
    tenantId: number,
    approvalId: number,
  ): Promise<ApprovalRecord | undefined> {
    return this.db().query.approvals.findFirst({
      where: and(
        eq(s.approvals.tenantId, tenantId),
        eq(s.approvals.id, approvalId),
      ),
    }) as Promise<ApprovalRecord | undefined>;
  }

  async findApprovalByPayloadHash(
    tenantId: number,
    kind: string,
    payloadHash: string,
  ): Promise<ApprovalRecord | undefined> {
    // SEC-6: consumed approvals (usedAt set) are invalid — never re-bind.
    return this.db().query.approvals.findFirst({
      where: and(
        eq(s.approvals.tenantId, tenantId),
        eq(s.approvals.kind, kind),
        eq(s.approvals.payloadHash, payloadHash),
        isNull(s.approvals.usedAt),
      ),
      orderBy: desc(s.approvals.id),
    }) as Promise<ApprovalRecord | undefined>;
  }

  async markApprovalUsed(tenantId: number, approvalId: number, usedAt: Date): Promise<void> {
    await this.db()
      .update(s.approvals)
      .set({ usedAt })
      .where(and(eq(s.approvals.tenantId, tenantId), eq(s.approvals.id, approvalId)));
  }

  async getSellerDirectionArtifact(
    tenantId: number,
    artifactId: number,
  ): Promise<SellerDirectionArtifactRecord | undefined> {
    return this.db().query.sellerDirectionArtifacts.findFirst({
      where: and(
        eq(s.sellerDirectionArtifacts.tenantId, tenantId),
        eq(s.sellerDirectionArtifacts.id, artifactId),
      ),
    }) as Promise<SellerDirectionArtifactRecord | undefined>;
  }

  async campaignSpendCents(tenantId: number, campaignId: number): Promise<number> {
    const rows = await this.db()
      .select({ id: s.campaignMessages.id })
      .from(s.campaignMessages)
      .where(
        and(
          eq(s.campaignMessages.tenantId, tenantId),
          eq(s.campaignMessages.campaignId, campaignId),
          eq(s.campaignMessages.status, "sent"),
        ),
      );
    // mock send cost: 1 cent per message
    return rows.length;
  }

  async recentSendCount(
    tenantId: number,
    contactId: number,
    channel: string,
    sinceDays: number,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await this.db()
      .select({ id: s.campaignMessages.id })
      .from(s.campaignMessages)
      .where(
        and(
          eq(s.campaignMessages.tenantId, tenantId),
          eq(s.campaignMessages.contactId, contactId),
          eq(s.campaignMessages.channel, channel as never),
          eq(s.campaignMessages.status, "sent"),
          gte(s.campaignMessages.sentAt, cutoff),
        ),
      );
    return rows.length;
  }

  async recordPolicyDecision(row: {
    tenantId: number;
    ruleIds: string[];
    action: string;
    actor: string;
    verdict: "allow" | "block" | "escalate";
    reasons: unknown;
    idempotencyKey?: string | null;
  }): Promise<number> {
    const [{ id }] = await this.db()
      .insert(s.policyDecisions)
      .values({
        tenantId: row.tenantId,
        ruleIds: row.ruleIds,
        action: row.action,
        actor: row.actor,
        verdict: row.verdict,
        reasons: row.reasons as never,
        idempotencyKey: row.idempotencyKey ?? null,
      })
      .$returningId();
    return id;
  }

  async listPolicyDecisions(tenantId: number): Promise<PolicyDecisionRecord[]> {
    const rows = await this.db()
      .select()
      .from(s.policyDecisions)
      .where(eq(s.policyDecisions.tenantId, tenantId))
      .orderBy(desc(s.policyDecisions.id));
    return rows as unknown as PolicyDecisionRecord[];
  }

  async enqueueOutbox(row: {
    tenantId: number;
    idempotencyKey: string;
    action: string;
    payload: unknown;
  }): Promise<{ id: number; created: boolean }> {
    // SEC-5: dedupe scope is (tenantId, action, idempotencyKey) — a different
    // action's row never squats this action's key.
    const existing = await this.getOutboxByKey(row.tenantId, row.action, row.idempotencyKey);
    if (existing) return { id: existing.id, created: false };
    try {
      const [{ id }] = await this.db()
        .insert(s.outbox)
        .values({
          tenantId: row.tenantId,
          idempotencyKey: row.idempotencyKey,
          action: row.action,
          payload: row.payload as never,
        })
        .$returningId();
      return { id, created: true };
    } catch (err) {
      // unique (tenantId, action, idempotencyKey) raced — treat as dedupe hit
      const dup = await this.getOutboxByKey(row.tenantId, row.action, row.idempotencyKey);
      if (dup) return { id: dup.id, created: false };
      throw err;
    }
  }

  async getOutboxByKey(tenantId: number, action: string, key: string): Promise<OutboxRecord | undefined> {
    return this.db().query.outbox.findFirst({
      where: and(
        eq(s.outbox.tenantId, tenantId),
        eq(s.outbox.action, action),
        eq(s.outbox.idempotencyKey, key),
      ),
    }) as Promise<OutboxRecord | undefined>;
  }

  async listPendingOutbox(limit = 100): Promise<OutboxRecord[]> {
    const rows = await this.db()
      .select()
      .from(s.outbox)
      .where(eq(s.outbox.status, "pending"))
      .orderBy(s.outbox.id)
      .limit(limit);
    return rows as unknown as OutboxRecord[];
  }

  async listOutboxByKeyPrefix(tenantId: number, keyPrefix: string): Promise<OutboxRecord[]> {
    // Escape LIKE wildcards — runner keys contain literal underscores.
    const escaped = keyPrefix.replace(/[\\%_]/g, (m) => `\\${m}`);
    const rows = await this.db()
      .select()
      .from(s.outbox)
      .where(
        and(
          eq(s.outbox.tenantId, tenantId),
          like(s.outbox.idempotencyKey, `${escaped}%`),
        ),
      )
      .orderBy(s.outbox.id);
    return rows as unknown as OutboxRecord[];
  }

  async markOutbox(
    tenantId: number,
    id: number,
    patch: Partial<
      Pick<
        OutboxRecord,
        "status" | "attempts" | "lastError" | "sentAt" | "policyDecisionId"
      >
    >,
  ): Promise<void> {
    // DB-8: tenant-scoped — a row outside the tenant is never touched.
    await this.db()
      .update(s.outbox)
      .set(patch as never)
      .where(and(eq(s.outbox.tenantId, tenantId), eq(s.outbox.id, id)));
  }

  async createWorkflow(row: {
    tenantId: number;
    kind: string;
    subjectId?: number | null;
    currentStep?: string | null;
    state: unknown;
  }): Promise<number> {
    const [{ id }] = await this.db()
      .insert(s.workflows)
      .values({
        tenantId: row.tenantId,
        kind: row.kind,
        subjectId: row.subjectId ?? null,
        currentStep: row.currentStep ?? null,
        state: row.state as never,
        status: "running",
      })
      .$returningId();
    return id;
  }

  async listWorkflows(tenantId: number): Promise<WorkflowRecord[]> {
    const rows = await this.db()
      .select()
      .from(s.workflows)
      .where(eq(s.workflows.tenantId, tenantId))
      .orderBy(desc(s.workflows.id));
    return rows as unknown as WorkflowRecord[];
  }

  async getWorkflow(tenantId: number, workflowId: number): Promise<WorkflowRecord | undefined> {
    // DB-8: tenant-scoped — a workflow outside the tenant is invisible.
    return this.db().query.workflows.findFirst({
      where: and(eq(s.workflows.tenantId, tenantId), eq(s.workflows.id, workflowId)),
    }) as Promise<WorkflowRecord | undefined>;
  }

  async appendWorkflowEvent(row: {
    tenantId: number;
    workflowId: number;
    type: string;
    payload: unknown;
  }): Promise<WorkflowEventRecord> {
    // DB-8: never append to a workflow outside the caller's tenant.
    const owner = await this.getWorkflow(row.tenantId, row.workflowId);
    if (!owner) {
      throw new Error(
        `workflow ${row.workflowId} not found in tenant ${row.tenantId} — refusing to append event`,
      );
    }
    // DB-7: seq is read-max-then-insert; concurrent appends (e.g. webhook vs
    // resume) collide on the workflow_events_wf_seq unique index. Catch the
    // duplicate-key error and retry with a fresh max (bounded) instead of
    // surfacing an unhandled error.
    // Retry-budget math: the audit concurrency test fires 5 simultaneous
    // appends, so one insert can collide up to 4 times before it wins a seq;
    // production webhook-vs-resume bursts can collide even more. 10 attempts
    // tolerates 9 collisions — comfortably above the worst case — with small
    // jittered backoff between attempts to de-synchronize competing writers.
    const MAX_ATTEMPTS = 10;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const existing = await this.db()
        .select({ seq: s.workflowEvents.seq })
        .from(s.workflowEvents)
        .where(eq(s.workflowEvents.workflowId, row.workflowId))
        .orderBy(desc(s.workflowEvents.seq))
        .limit(1);
      const seq = (existing[0]?.seq ?? 0) + 1;
      try {
        const [{ id }] = await this.db()
          .insert(s.workflowEvents)
          .values({
            tenantId: row.tenantId,
            workflowId: row.workflowId,
            seq,
            type: row.type,
            payload: row.payload as never,
          })
          .$returningId();
        const created = await this.db().query.workflowEvents.findFirst({
          where: eq(s.workflowEvents.id, id),
        });
        return created as unknown as WorkflowEventRecord;
      } catch (err) {
        // Only mask ER_DUP_ENTRY on the workflow_events_wf_seq unique index;
        // any other error propagates immediately.
        if (!isDuplicateKeyError(err)) throw err;
        lastError = err;
        if (attempt < MAX_ATTEMPTS - 1) {
          // 5–20ms random jitter before re-reading max(seq) and retrying.
          await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 16)));
        }
      }
    }
    // Practically unreachable (10 attempts tolerates 9 collisions), but never
    // surface a raw dup-key error — fail with a clear, diagnosable message.
    throw new Error(
      `appendWorkflowEvent: exhausted ${MAX_ATTEMPTS} attempts for workflow ${row.workflowId} — persistent seq collision on workflow_events_wf_seq (last error: ${lastError instanceof Error ? lastError.message : String(lastError)})`,
    );
  }

  async listWorkflowEvents(tenantId: number, workflowId: number): Promise<WorkflowEventRecord[]> {
    const rows = await this.db()
      .select()
      .from(s.workflowEvents)
      .where(
        and(
          eq(s.workflowEvents.tenantId, tenantId),
          eq(s.workflowEvents.workflowId, workflowId),
        ),
      )
      .orderBy(s.workflowEvents.seq);
    return rows as unknown as WorkflowEventRecord[];
  }

  async updateWorkflow(
    tenantId: number,
    workflowId: number,
    patch: Partial<
      Pick<WorkflowRecord, "status" | "currentStep" | "state" | "version">
    >,
  ): Promise<void> {
    await this.db()
      .update(s.workflows)
      .set(patch as never)
      .where(and(eq(s.workflows.tenantId, tenantId), eq(s.workflows.id, workflowId)));
  }

  async getLastAudit(tenantId: number): Promise<AuditRecord | undefined> {
    const rows = await this.db()
      .select()
      .from(s.auditLog)
      .where(eq(s.auditLog.tenantId, tenantId))
      .orderBy(desc(s.auditLog.seq))
      .limit(1);
    return rows[0] as AuditRecord | undefined;
  }

  async appendAuditRow(
    row: Omit<AuditRecord, "id" | "createdAt">,
  ): Promise<AuditRecord> {
    const [{ id }] = await this.db()
      .insert(s.auditLog)
      .values(row as never)
      .$returningId();
    const created = await this.db().query.auditLog.findFirst({
      where: eq(s.auditLog.id, id),
    });
    return created as unknown as AuditRecord;
  }

  async listAudit(tenantId: number): Promise<AuditRecord[]> {
    const rows = await this.db()
      .select()
      .from(s.auditLog)
      .where(eq(s.auditLog.tenantId, tenantId))
      .orderBy(s.auditLog.seq);
    return rows as AuditRecord[];
  }

  async recordModelCall(row: {
    tenantId?: number | null;
    provider: string;
    model: string;
    promptVersion: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    sensitivity: string;
    piiRedacted: boolean;
    durationMs: number;
    status: string;
  }): Promise<number> {
    const [{ id }] = await this.db()
      .insert(s.modelCalls)
      .values({ ...row, tenantId: row.tenantId ?? null })
      .$returningId();
    return id;
  }
}

let instance: DrizzleStore | undefined;
export function getStore(): Store {
  if (!instance) instance = new DrizzleStore();
  return instance;
}
