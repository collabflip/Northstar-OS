/**
 * Store abstraction — the seam that lets the policy kernel, workflow runner,
 * audit chain and gateway be fully tested without a live database.
 *
 * Production code uses `DrizzleStore` (api/store/drizzle.ts) backed by MySQL;
 * tests use `MemoryStore` (api/store/memory.ts). Both honour the same
 * semantics, including outbox idempotency-key dedupe and append-only events.
 */

export type Verdict = "allow" | "block" | "escalate";

export interface TenantRecord {
  id: number;
  name: string;
  province: string;
  timezone: string;
  brokeragePolicyVersion: string;
  autonomyCeiling: string;
  /** F6: DNCL posture — "unregistered" disables outbound voice. */
  dnclPosture?: string;
  policyPackVersion?: string | null;
}

export interface MembershipRecord {
  id: number;
  userId: number;
  tenantId: number;
  role: string;
}

export interface ContactRecord {
  id: number;
  tenantId: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  language: string;
  kind: string;
  isSrp: boolean;
  onInternalDnc: boolean;
  dncRequestedAt?: Date | null;
  onDncl: boolean;
  dnclScrubbedAt?: Date | null;
  /** F6: called party's IANA timezone (null → fall back to tenant timezone). */
  timezone?: string | null;
  stage: string;
}

export interface ConsentRecordLite {
  id: number;
  contactId: number;
  channel: string;
  basis: "express" | "implied" | "none";
  evidenceText?: string | null;
  source?: string | null;
  purpose?: string | null;
  capturedAt: Date;
  expiresAt?: Date | null;
  status: string;
}

export interface ApprovalRecord {
  id: number;
  tenantId: number;
  kind: string;
  title: string;
  payload: unknown;
  payloadHash: string;
  destination: string;
  status: string;
  decidedBy?: number | null;
  decidedAt?: Date | null;
  reason?: string | null;
  /** SEC-6: set when the gated action executed — consumed approvals are invalid. */
  usedAt?: Date | null;
  expiresAt: Date;
  autonomyLevel: string;
  requestedBy: string;
  createdAt: Date;
}

export interface SellerDirectionArtifactRecord {
  id: number;
  tenantId: number;
  propertyId: number;
  contactId?: number | null;
  signedEvidenceText: string;
  status: string; // pending | verified | revoked
  verifiedByUserId?: number | null;
  verifiedAt?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface OutboxRecord {
  id: number;
  tenantId: number;
  idempotencyKey: string;
  action: string;
  payload: unknown;
  status: string;
  attempts: number;
  policyDecisionId?: number | null;
  lastError?: string | null;
  createdAt: Date;
  sentAt?: Date | null;
}

export interface WorkflowRecord {
  id: number;
  tenantId: number;
  kind: string;
  subjectId?: number | null;
  status: string;
  currentStep?: string | null;
  state: unknown;
  version: number;
}

export interface WorkflowEventRecord {
  id: number;
  workflowId: number;
  seq: number;
  type: string;
  payload: unknown;
  createdAt: Date;
}

export interface AuditRecord {
  id: number;
  seq: number;
  tenantId: number;
  actorId?: number | null;
  actorRole?: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  payloadHash: string;
  policyDecisionId?: number | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
  prevHash: string;
  hash: string;
  createdAt: Date;
}

export interface PolicyDecisionRecord {
  id: number;
  tenantId: number;
  ruleIds: string[];
  action: string;
  actor: string;
  verdict: Verdict;
  reasons: unknown;
  idempotencyKey?: string | null;
  createdAt: Date;
}

export interface NewAuditEntry {
  tenantId: number;
  actorId?: number | null;
  actorRole?: string | null;
  action: string;
  subjectType: string;
  subjectId: string | number;
  payload: unknown;
  policyDecisionId?: number | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
}

export interface Store {
  /**
   * DB-5: run a set of store writes atomically. On the live database this is
   * a real SQL transaction (all writes commit or none do); MemoryStore
   * executes inline (single-threaded tests need no rollback).
   */
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;

  getTenant(tenantId: number): Promise<TenantRecord | undefined>;
  getMembership(
    tenantId: number,
    userId: number,
  ): Promise<MembershipRecord | undefined>;

  getContact(
    tenantId: number,
    contactId: number,
  ): Promise<ContactRecord | undefined>;
  latestConsent(
    tenantId: number,
    contactId: number,
    channel: string,
  ): Promise<ConsentRecordLite | undefined>;
  isSuppressed(
    tenantId: number,
    contactId: number,
    channel: string,
  ): Promise<boolean>;

  getApproval(
    tenantId: number,
    approvalId: number,
  ): Promise<ApprovalRecord | undefined>;
  /**
   * F5: resolve an approval by its canonical action binding
   * (tenantId, actionType/kind, payloadHash) — used by the workflow drainer.
   * SEC-6: consumed approvals (usedAt set) are never returned — single-use.
   */
  findApprovalByPayloadHash(
    tenantId: number,
    kind: string,
    payloadHash: string,
  ): Promise<ApprovalRecord | undefined>;
  /** SEC-6: mark an approval consumed when its gated action executes. */
  markApprovalUsed(tenantId: number, approvalId: number, usedAt: Date): Promise<void>;

  /** F8: tenant-scoped lookup of a written seller direction artifact (TRESA-08). */
  getSellerDirectionArtifact(
    tenantId: number,
    artifactId: number,
  ): Promise<SellerDirectionArtifactRecord | undefined>;

  campaignSpendCents(tenantId: number, campaignId: number): Promise<number>;
  recentSendCount(
    tenantId: number,
    contactId: number,
    channel: string,
    sinceDays: number,
  ): Promise<number>;

  recordPolicyDecision(row: {
    tenantId: number;
    ruleIds: string[];
    action: string;
    actor: string;
    verdict: Verdict;
    reasons: unknown;
    idempotencyKey?: string | null;
  }): Promise<number>;
  listPolicyDecisions(tenantId: number): Promise<PolicyDecisionRecord[]>;

  /** Per-tenant, per-action idempotency-key dedupe: returns created=false on duplicate. */
  enqueueOutbox(row: {
    tenantId: number;
    idempotencyKey: string;
    action: string;
    payload: unknown;
  }): Promise<{ id: number; created: boolean }>;
  /**
   * F10 + SEC-5: keys are unique within (tenantId, action) — lookups must
   * scope by action type or a different action's row squats the key.
   */
  getOutboxByKey(tenantId: number, action: string, key: string): Promise<OutboxRecord | undefined>;
  listPendingOutbox(limit?: number): Promise<OutboxRecord[]>;
  /** Tenant-scoped prefix scan (runner effect keys are `wf_<id>_…`). */
  listOutboxByKeyPrefix(tenantId: number, keyPrefix: string): Promise<OutboxRecord[]>;
  /** DB-8: tenant-scoped — a row outside the tenant is never touched. */
  markOutbox(
    tenantId: number,
    id: number,
    patch: Partial<
      Pick<
        OutboxRecord,
        "status" | "attempts" | "lastError" | "sentAt" | "policyDecisionId"
      >
    >,
  ): Promise<void>;

  createWorkflow(row: {
    tenantId: number;
    kind: string;
    subjectId?: number | null;
    currentStep?: string | null;
    state: unknown;
  }): Promise<number>;
  /** DB-8: all workflow reads/writes are tenant-scoped. */
  listWorkflows(tenantId: number): Promise<WorkflowRecord[]>;
  getWorkflow(tenantId: number, workflowId: number): Promise<WorkflowRecord | undefined>;
  /** Throws when the workflow does not belong to row.tenantId. */
  appendWorkflowEvent(row: {
    tenantId: number;
    workflowId: number;
    type: string;
    payload: unknown;
  }): Promise<WorkflowEventRecord>;
  listWorkflowEvents(tenantId: number, workflowId: number): Promise<WorkflowEventRecord[]>;
  updateWorkflow(
    tenantId: number,
    workflowId: number,
    patch: Partial<
      Pick<WorkflowRecord, "status" | "currentStep" | "state" | "version">
    >,
  ): Promise<void>;

  getLastAudit(tenantId: number): Promise<AuditRecord | undefined>;
  appendAuditRow(
    row: Omit<AuditRecord, "id" | "createdAt">,
  ): Promise<AuditRecord>;
  listAudit(tenantId: number): Promise<AuditRecord[]>;

  recordModelCall(row: {
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
  }): Promise<number>;
}
