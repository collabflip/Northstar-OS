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
 * In-memory Store implementation used by the test suite (and as a reference
 * for exact semantics: idempotent outbox, append-only workflow events,
 * tenant-scoped lookups that never leak across tenants).
 */
export class MemoryStore implements Store {
  tenants = new Map<number, TenantRecord>();
  memberships: MembershipRecord[] = [];
  contacts = new Map<number, ContactRecord>();
  consents: (ConsentRecordLite & { tenantId: number })[] = [];
  suppressions: { contactId: number; channel: string; tenantId: number }[] = [];
  approvals = new Map<number, ApprovalRecord>();
  sellerDirectionArtifacts = new Map<number, SellerDirectionArtifactRecord>();
  outboxRows = new Map<number, OutboxRecord>();
  /** F10 + SEC-5: keyed `${tenantId}:${action}:${idempotencyKey}` — per-tenant, per-action dedupe. */
  outboxByKey = new Map<string, number>();
  policyDecisions = new Map<number, PolicyDecisionRecord>();
  workflows = new Map<number, WorkflowRecord>();
  workflowEvents: WorkflowEventRecord[] = [];
  auditRows = new Map<number, AuditRecord>();
  campaignMessages: {
    tenantId: number;
    campaignId: number;
    contactId: number;
    channel: string;
    status: string;
    sentAt?: Date | null;
    costCents?: number;
  }[] = [];
  modelCalls: unknown[] = [];

  private seq = 1;
  private nextId() {
    return this.seq++;
  }

  /** DB-5: in-memory stores are single-threaded — execute inline. */
  async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    return fn(this);
  }

  // ── test seeding helpers ──────────────────────────────────────────────
  addTenant(t: TenantRecord) {
    this.tenants.set(t.id, t);
    return t;
  }
  addMembership(m: Omit<MembershipRecord, "id">) {
    const row = { ...m, id: this.nextId() };
    this.memberships.push(row);
    return row;
  }
  addContact(c: ContactRecord) {
    this.contacts.set(c.id, c);
    return c;
  }
  addConsent(c: ConsentRecordLite & { tenantId: number }) {
    this.consents.push(c);
    return c;
  }
  addSuppression(tenantId: number, contactId: number, channel: string) {
    this.suppressions.push({ tenantId, contactId, channel });
  }
  addApproval(a: ApprovalRecord) {
    this.approvals.set(a.id, a);
    return a;
  }
  addSellerDirectionArtifact(a: SellerDirectionArtifactRecord) {
    this.sellerDirectionArtifacts.set(a.id, a);
    return a;
  }

  // ── Store interface ───────────────────────────────────────────────────
  async getTenant(tenantId: number) {
    return this.tenants.get(tenantId);
  }
  async getMembership(tenantId: number, userId: number) {
    return this.memberships.find(
      (m) => m.tenantId === tenantId && m.userId === userId,
    );
  }
  async getContact(tenantId: number, contactId: number) {
    const c = this.contacts.get(contactId);
    return c && c.tenantId === tenantId ? c : undefined;
  }
  async latestConsent(tenantId: number, contactId: number, channel: string) {
    const rows = this.consents
      .filter(
        (c) =>
          c.tenantId === tenantId &&
          c.contactId === contactId &&
          c.channel === channel,
      )
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
    return rows[0];
  }
  async isSuppressed(tenantId: number, contactId: number, channel: string) {
    return this.suppressions.some(
      (s) =>
        s.tenantId === tenantId &&
        s.contactId === contactId &&
        s.channel === channel,
    );
  }
  async getApproval(tenantId: number, approvalId: number) {
    const a = this.approvals.get(approvalId);
    return a && a.tenantId === tenantId ? a : undefined;
  }
  async findApprovalByPayloadHash(tenantId: number, kind: string, payloadHash: string) {
    // SEC-6: consumed approvals are invalid — never re-bind them.
    return [...this.approvals.values()].find(
      (a) => a.tenantId === tenantId && a.kind === kind && a.payloadHash === payloadHash && !a.usedAt,
    );
  }
  async markApprovalUsed(tenantId: number, approvalId: number, usedAt: Date) {
    const a = this.approvals.get(approvalId);
    if (a && a.tenantId === tenantId) a.usedAt = usedAt;
  }
  async getSellerDirectionArtifact(tenantId: number, artifactId: number) {
    const a = this.sellerDirectionArtifacts.get(artifactId);
    return a && a.tenantId === tenantId ? a : undefined;
  }
  async campaignSpendCents(tenantId: number, campaignId: number) {
    return this.campaignMessages
      .filter(
        (m) =>
          m.tenantId === tenantId &&
          m.campaignId === campaignId &&
          m.status === "sent",
      )
      .reduce((sum, m) => sum + (m.costCents ?? 1), 0);
  }
  async recentSendCount(
    tenantId: number,
    contactId: number,
    channel: string,
    sinceDays: number,
  ) {
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return this.campaignMessages.filter(
      (m) =>
        m.tenantId === tenantId &&
        m.contactId === contactId &&
        m.channel === channel &&
        m.status === "sent" &&
        (m.sentAt?.getTime() ?? 0) >= cutoff,
    ).length;
  }
  async recordPolicyDecision(row: {
    tenantId: number;
    ruleIds: string[];
    action: string;
    actor: string;
    verdict: "allow" | "block" | "escalate";
    reasons: unknown;
    idempotencyKey?: string | null;
  }) {
    const id = this.nextId();
    this.policyDecisions.set(id, { ...row, id, createdAt: new Date() });
    return id;
  }
  async listPolicyDecisions(tenantId: number) {
    return [...this.policyDecisions.values()].filter(
      (d) => d.tenantId === tenantId,
    );
  }
  async enqueueOutbox(row: {
    tenantId: number;
    idempotencyKey: string;
    action: string;
    payload: unknown;
  }) {
    const scopedKey = `${row.tenantId}:${row.action}:${row.idempotencyKey}`;
    const existing = this.outboxByKey.get(scopedKey);
    if (existing !== undefined) {
      return { id: existing, created: false };
    }
    const id = this.nextId();
    this.outboxRows.set(id, {
      id,
      tenantId: row.tenantId,
      idempotencyKey: row.idempotencyKey,
      action: row.action,
      payload: row.payload,
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
    });
    this.outboxByKey.set(scopedKey, id);
    return { id, created: true };
  }
  async getOutboxByKey(tenantId: number, action: string, key: string) {
    const id = this.outboxByKey.get(`${tenantId}:${action}:${key}`);
    return id === undefined ? undefined : this.outboxRows.get(id);
  }
  async listPendingOutbox(limit = 100) {
    return [...this.outboxRows.values()]
      .filter((r) => r.status === "pending")
      .slice(0, limit);
  }
  async listOutboxByKeyPrefix(tenantId: number, keyPrefix: string) {
    return [...this.outboxRows.values()].filter(
      (r) => r.tenantId === tenantId && r.idempotencyKey.startsWith(keyPrefix),
    );
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
  ) {
    const row = this.outboxRows.get(id);
    if (row && row.tenantId === tenantId) Object.assign(row, patch);
  }
  async createWorkflow(row: {
    tenantId: number;
    kind: string;
    subjectId?: number | null;
    currentStep?: string | null;
    state: unknown;
  }) {
    const id = this.nextId();
    this.workflows.set(id, { ...row, id, status: "running", version: 1 });
    return id;
  }
  async listWorkflows(tenantId: number) {
    return [...this.workflows.values()].filter((w) => w.tenantId === tenantId);
  }
  async getWorkflow(tenantId: number, workflowId: number) {
    const wf = this.workflows.get(workflowId);
    return wf && wf.tenantId === tenantId ? wf : undefined;
  }
  async appendWorkflowEvent(row: {
    tenantId: number;
    workflowId: number;
    type: string;
    payload: unknown;
  }): Promise<WorkflowEventRecord> {
    const wf = this.workflows.get(row.workflowId);
    if (!wf || wf.tenantId !== row.tenantId) {
      throw new Error(
        `workflow ${row.workflowId} not found in tenant ${row.tenantId} — refusing to append event`,
      );
    }
    const existing = this.workflowEvents.filter(
      (e) => e.workflowId === row.workflowId,
    );
    const seq = existing.length + 1;
    const event: WorkflowEventRecord = {
      id: this.nextId(),
      workflowId: row.workflowId,
      seq,
      type: row.type,
      payload: row.payload,
      createdAt: new Date(),
    };
    this.workflowEvents.push(event);
    return event;
  }
  async listWorkflowEvents(tenantId: number, workflowId: number) {
    const wf = this.workflows.get(workflowId);
    if (!wf || wf.tenantId !== tenantId) return [];
    return this.workflowEvents
      .filter((e) => e.workflowId === workflowId)
      .sort((a, b) => a.seq - b.seq);
  }
  async updateWorkflow(
    tenantId: number,
    workflowId: number,
    patch: Partial<
      Pick<WorkflowRecord, "status" | "currentStep" | "state" | "version">
    >,
  ) {
    const wf = this.workflows.get(workflowId);
    if (wf && wf.tenantId === tenantId) Object.assign(wf, patch);
  }
  async getLastAudit(tenantId: number) {
    const rows = [...this.auditRows.values()].filter(
      (r) => r.tenantId === tenantId,
    );
    return rows.sort((a, b) => b.seq - a.seq)[0];
  }
  async appendAuditRow(
    row: Omit<AuditRecord, "id" | "createdAt">,
  ): Promise<AuditRecord> {
    // Mirror the live audit_tenant_seq UNIQUE index (DB-7): concurrent writers
    // in one tenant must collide here exactly as they would in MySQL, so the
    // appendAudit retry path is exercised identically in tests.
    const clash = [...this.auditRows.values()].some(
      (r) => r.tenantId === row.tenantId && r.seq === row.seq,
    );
    if (clash) {
      const err = new Error(
        `Duplicate entry '${row.tenantId}-${row.seq}' for key 'audit_tenant_seq'`,
      ) as Error & { code: string };
      err.code = "ER_DUP_ENTRY";
      throw err;
    }
    const id = this.nextId();
    const rec: AuditRecord = { ...row, id, createdAt: new Date() };
    this.auditRows.set(id, rec);
    return rec;
  }
  async listAudit(tenantId: number) {
    return [...this.auditRows.values()]
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => a.seq - b.seq);
  }
  async recordModelCall(row: Record<string, unknown>) {
    this.modelCalls.push(row);
    return this.nextId();
  }
}
