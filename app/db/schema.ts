import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  varchar,
  text,
  json,
  timestamp,
  int,
  boolean,
  uniqueIndex,
  index,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";

// FK columns referencing a serial() PK must be:
//   bigint("col", { mode: "number", unsigned: true })
// DB-1: real FOREIGN KEY constraints (TiDB 8.5 enforces FKs; previously these
// were unconstrained bigint columns — "app-level integrity only"). NOT NULL
// child rows CASCADE on parent delete (tenant teardown / fixture cleanup);
// nullable references SET NULL so evidence/audit rows survive parent removal.
// Live DDL was applied manually (additive ALTER TABLEs) — see docs/deployment.
const fk = (name: string, ref: () => AnyMySqlColumn) =>
  bigint(name, { mode: "number", unsigned: true })
    .notNull()
    .references(ref, { onDelete: "cascade" });
const fkNull = (name: string, ref: () => AnyMySqlColumn) =>
  bigint(name, { mode: "number", unsigned: true }).references(ref, {
    onDelete: "set null",
  });
// Polymorphic subject references (subjectType + subjectId point at different
// tables per row) can never be a database-level FK — app-level integrity only.
const fkPoly = (name: string) =>
  bigint(name, { mode: "number", unsigned: true }).notNull();
const fkNullPoly = (name: string) =>
  bigint(name, { mode: "number", unsigned: true });

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin", "seller"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Tenancy ────────────────────────────────────────────────────────────────

export const tenants = mysqlTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  kind: mysqlEnum("kind", ["brokerage", "team", "solo"])
    .default("brokerage")
    .notNull(),
  province: varchar("province", { length: 2 }).notNull(), // e.g. "ON"
  timezone: varchar("timezone", { length: 64 })
    .default("America/Toronto")
    .notNull(),
  policyPackVersion: varchar("policyPackVersion", { length: 32 }),
  brokeragePolicyVersion: varchar("brokeragePolicyVersion", { length: 32 })
    .default("2.3")
    .notNull(),
  autonomyCeiling: varchar("autonomyCeiling", { length: 2 })
    .default("A2")
    .notNull(),
  // F6: DNCL posture — "unregistered" tenants cannot place outbound voice calls.
  dnclPosture: mysqlEnum("dnclPosture", ["unregistered", "standard", "strict"])
    .default("standard")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const membershipRoleValues = [
  "solo_registrant",
  "team_member",
  "brokerage_admin",
  "broker_of_record",
  "marketing_coordinator",
  "transaction_coordinator",
  "privacy_admin",
  "fintrac_officer",
  // External demo role (TRESA seller impersonation in the demo brokerage).
  "seller",
] as const;

export type MembershipRole = (typeof membershipRoleValues)[number];

export const memberships = mysqlTable(
  "memberships",
  {
    id: serial("id").primaryKey(),
    userId: fk("userId", () => users.id),
    tenantId: fk("tenantId", () => tenants.id),
    role: mysqlEnum("role", membershipRoleValues).notNull(),
    isDefault: boolean("isDefault").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    userTenant: uniqueIndex("memberships_user_tenant").on(t.userId, t.tenantId),
    tenantIdx: index("memberships_tenant_idx").on(t.tenantId),
  }),
);

// ─── CRM ────────────────────────────────────────────────────────────────────

export const contactStageValues = [
  "new_lead",
  "qualified",
  "consultation_booked",
  "dossier_ready",
  "strategy_proposed",
  "approved",
  "live_listing",
  "offer_review",
  "under_contract",
  "closed",
] as const;

export const contacts = mysqlTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    firstName: varchar("firstName", { length: 120 }).notNull(),
    lastName: varchar("lastName", { length: 120 }).notNull(),
    preferredName: varchar("preferredName", { length: 160 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    language: varchar("language", { length: 8 }).default("en").notNull(), // en | fr-CA
    kind: mysqlEnum("kind", ["seller", "buyer_lead", "srp", "other"])
      .default("seller")
      .notNull(),
    leadSource: varchar("leadSource", { length: 120 }),
    relationshipToProperty: varchar("relationshipToProperty", { length: 120 }),
    motivation: text("motivation"),
    timing: varchar("timing", { length: 120 }),
    occupancy: varchar("occupancy", { length: 120 }),
    renovations: json("renovations"),
    commPrefs: json("commPrefs"),
    mortgageContextNote: text("mortgageContextNote"),
    isSrp: boolean("isSrp").default(false).notNull(),
    onInternalDnc: boolean("onInternalDnc").default(false).notNull(),
    dncRequestedAt: timestamp("dncRequestedAt"),
    onDncl: boolean("onDncl").default(false).notNull(),
    dnclScrubbedAt: timestamp("dnclScrubbedAt"),
    // F6: CALLED PARTY's IANA timezone (nullable). DNCL calling hours resolve
    // in this zone when known, falling back to the tenant timezone.
    timezone: varchar("timezone", { length: 64 }),
    // PIPEDA-07 / COMP-3: province of residence tag (nullable). A contact
    // tagged outside the production pack scope (BC/AB/QC in an ON tenant)
    // fails CLOSED to manual review at the gate — never silently evaluated
    // under the tenant's rules. NULL = untagged → tenant pack applies.
    province: varchar("province", { length: 2 }),
    leadScore: int("leadScore"),
    leadScoreReasons: json("leadScoreReasons"),
    stage: mysqlEnum("stage", contactStageValues).default("new_lead").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ tenantIdx: index("contacts_tenant_idx").on(t.tenantId) }),
);

export const consentBasisValues = ["express", "implied", "none"] as const;
export const channelValues = ["email", "sms", "voice", "dm"] as const;

export const consentRecords = mysqlTable(
  "consent_records",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    contactId: fk("contactId", () => contacts.id),
    channel: mysqlEnum("channel", channelValues).notNull(),
    basis: mysqlEnum("basis", consentBasisValues).notNull(),
    evidenceText: text("evidenceText"),
    source: varchar("source", { length: 255 }),
    purpose: varchar("purpose", { length: 255 }),
    capturedAt: timestamp("capturedAt").notNull(),
    expiresAt: timestamp("expiresAt"),
    status: mysqlEnum("status", ["active", "expired", "withdrawn"])
      .default("active")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    contactIdx: index("consent_contact_idx").on(t.contactId),
    tenantIdx: index("consent_tenant_idx").on(t.tenantId),
  }),
);

export const suppressionList = mysqlTable(
  "suppression_list",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    contactId: fk("contactId", () => contacts.id),
    channel: mysqlEnum("channel", channelValues).notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    contactChannel: uniqueIndex("suppression_contact_channel").on(
      t.contactId,
      t.channel,
    ),
  }),
);

// ─── Property intelligence ──────────────────────────────────────────────────

export const properties = mysqlTable(
  "properties",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    ownerContactId: fkNull("ownerContactId", () => contacts.id),
    addressLine1: varchar("addressLine1", { length: 255 }).notNull(),
    addressLine2: varchar("addressLine2", { length: 255 }),
    city: varchar("city", { length: 120 }).notNull(),
    province: varchar("province", { length: 2 }).notNull(),
    postalCode: varchar("postalCode", { length: 12 }).notNull(),
    propertyType: varchar("propertyType", { length: 80 }),
    beds: int("beds"),
    baths: int("baths"),
    sqft: int("sqft"),
    lotDescription: varchar("lotDescription", { length: 120 }),
    yearBuilt: int("yearBuilt"),
    ownershipConfirmed: boolean("ownershipConfirmed").default(false).notNull(),
    externalListingRef: varchar("externalListingRef", { length: 120 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ tenantIdx: index("properties_tenant_idx").on(t.tenantId) }),
);

export const evidenceKindValues = [
  "verified",
  "third_party",
  "estimate",
  "generated",
  "assumption",
] as const;

export const evidence = mysqlTable(
  "evidence",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    subjectType: varchar("subjectType", { length: 60 }).notNull(),
    subjectId: fkPoly("subjectId"),
    kind: mysqlEnum("kind", evidenceKindValues).notNull(),
    statement: text("statement").notNull(),
    sourceName: varchar("sourceName", { length: 255 }),
    sourceRef: varchar("sourceRef", { length: 255 }),
    pageRef: varchar("pageRef", { length: 80 }),
    freshness: timestamp("freshness"),
    confidence: int("confidence"), // 0..100
    lineage: json("lineage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    subjectIdx: index("evidence_subject_idx").on(t.subjectType, t.subjectId),
    tenantIdx: index("evidence_tenant_idx").on(t.tenantId),
  }),
);

export const dossiers = mysqlTable(
  "dossiers",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    propertyId: fk("propertyId", () => properties.id),
    profile: json("profile"),
    timeline: json("timeline"),
    marketContext: json("marketContext"),
    contradictions: json("contradictions"),
    missingInfo: json("missingInfo"),
    agentQuestions: json("agentQuestions"),
    status: mysqlEnum("status", ["draft", "ready", "stale"])
      .default("draft")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ tenantIdx: index("dossiers_tenant_idx").on(t.tenantId) }),
);

export const comparables = mysqlTable(
  "comparables",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    dossierId: fk("dossierId", () => dossiers.id),
    address: varchar("address", { length: 255 }).notNull(),
    soldPrice: int("soldPrice").notNull(),
    soldDate: timestamp("soldDate").notNull(),
    beds: int("beds"),
    baths: int("baths"),
    sqft: int("sqft"),
    distanceKm: varchar("distanceKm", { length: 20 }),
    relevanceScore: int("relevanceScore"),
    selected: boolean("selected").default(true).notNull(),
    exclusionReason: varchar("exclusionReason", { length: 255 }),
    selectionReasoning: text("selectionReasoning"),
    adjustments: json("adjustments"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ dossierIdx: index("comparables_dossier_idx").on(t.dossierId) }),
);

export const valuations = mysqlTable(
  "valuations",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    dossierId: fk("dossierId", () => dossiers.id),
    low: int("low").notNull(),
    mid: int("mid").notNull(),
    high: int("high").notNull(),
    confidenceInterval: int("confidenceInterval"), // 0..100
    assumptions: json("assumptions"),
    rationale: text("rationale"),
    disclaimer: text("disclaimer").notNull(),
    modelVersion: varchar("modelVersion", { length: 60 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ dossierIdx: index("valuations_dossier_idx").on(t.dossierId) }),
);

export const strategies = mysqlTable(
  "strategies",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    propertyId: fk("propertyId", () => properties.id),
    positioning: json("positioning"),
    prepWork: json("prepWork"),
    mediaPlan: json("mediaPlan"),
    launchSequence: json("launchSequence"),
    commsPlan: json("commsPlan"),
    showingStrategy: json("showingStrategy"),
    timeline: json("timeline"),
    status: mysqlEnum("status", ["draft", "proposed", "approved", "rejected"])
      .default("draft")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ tenantIdx: index("strategies_tenant_idx").on(t.tenantId) }),
);

// ─── Approvals ──────────────────────────────────────────────────────────────

export const approvals = mysqlTable(
  "approvals",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    kind: varchar("kind", { length: 60 }).notNull(), // content | campaign | communication | pricing | decision
    title: varchar("title", { length: 255 }).notNull(),
    payload: json("payload").notNull(),
    payloadHash: varchar("payloadHash", { length: 80 }).notNull(),
    destination: varchar("destination", { length: 255 }).notNull(),
    policyDecisionId: fkNull("policyDecisionId", () => policyDecisions.id),
    requestedBy: varchar("requestedBy", { length: 120 }).notNull(),
    requestedByUserId: fkNull("requestedByUserId", () => users.id),
    autonomyLevel: varchar("autonomyLevel", { length: 2 }).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .default("pending")
      .notNull(),
    decidedBy: fkNull("decidedBy", () => users.id),
    decidedAt: timestamp("decidedAt"),
    reason: text("reason"),
    // SEC-6: single-use consumption — set by the drainer when the gated
    // action actually executes. The gate + approval lookups treat a
    // consumed approval as invalid (no replay within the 48h TTL).
    usedAt: timestamp("usedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ tenantIdx: index("approvals_tenant_idx").on(t.tenantId) }),
);

// ─── Campaigns ──────────────────────────────────────────────────────────────

export const campaigns = mysqlTable(
  "campaigns",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    name: varchar("name", { length: 255 }).notNull(),
    audience: json("audience"),
    contentFamily: varchar("contentFamily", { length: 120 }),
    budgetCapCents: int("budgetCapCents"),
    frequencyCapPerWeek: int("frequencyCapPerWeek"),
    schedule: json("schedule"),
    channels: json("channels"),
    autonomyLevel: varchar("autonomyLevel", { length: 2 }).default("A2").notNull(),
    status: mysqlEnum("status", [
      "draft",
      "pending_approval",
      "approved",
      "active",
      "paused",
      "completed",
    ])
      .default("draft")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ tenantIdx: index("campaigns_tenant_idx").on(t.tenantId) }),
);

export const campaignMessages = mysqlTable(
  "campaign_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    campaignId: fk("campaignId", () => campaigns.id),
    contactId: fk("contactId", () => contacts.id),
    channel: mysqlEnum("channel", channelValues).notNull(),
    body: text("body").notNull(),
    status: mysqlEnum("status", ["draft", "queued", "sent", "blocked", "failed"])
      .default("draft")
      .notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 120 }).notNull(),
    policyDecisionId: fkNull("policyDecisionId", () => policyDecisions.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    sentAt: timestamp("sentAt"),
  },
  (t) => ({
    idemKey: uniqueIndex("campaign_messages_idem").on(t.idempotencyKey),
    campaignIdx: index("campaign_messages_campaign_idx").on(t.campaignId),
  }),
);

// ─── Conversations ──────────────────────────────────────────────────────────

export const conversations = mysqlTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    contactId: fk("contactId", () => contacts.id),
    channel: mysqlEnum("channel", channelValues).notNull(),
    status: mysqlEnum("status", ["open", "needs_review", "escalated", "closed"])
      .default("open")
      .notNull(),
    assignedTo: fkNull("assignedTo", () => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ tenantIdx: index("conversations_tenant_idx").on(t.tenantId) }),
);

export const messages = mysqlTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    conversationId: fk("conversationId", () => conversations.id),
    direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
    body: text("body").notNull(),
    groundedEvidenceIds: json("groundedEvidenceIds"),
    aiDisclosed: boolean("aiDisclosed").default(false).notNull(),
    isAiDraft: boolean("isAiDraft").default(false).notNull(),
    escalation: json("escalation"),
    status: mysqlEnum("status", ["received", "draft", "sent", "blocked"])
      .default("received")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    conversationIdx: index("messages_conversation_idx").on(t.conversationId),
  }),
);

// ─── Seller direction artifacts (TRESA-08) ──────────────────────────────────

/**
 * F8: persisted evidence of written seller direction. TRESA-08-gated flows
 * (e.g. competing-offer content disclosure, directed price changes) must
 * reference a non-revoked row here in the SAME tenant — caller-asserted
 * booleans are never accepted as direction.
 */
export const sellerDirectionStatusValues = ["pending", "verified", "revoked"] as const;

export const sellerDirectionArtifacts = mysqlTable(
  "seller_direction_artifacts",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    propertyId: fk("propertyId", () => properties.id),
    contactId: fkNull("contactId", () => contacts.id), // contacts.id of the directing seller
    signedEvidenceText: text("signedEvidenceText").notNull(), // captured direction text / evidence
    status: mysqlEnum("status", sellerDirectionStatusValues).default("pending").notNull(),
    verifiedByUserId: fkNull("verifiedByUserId", () => users.id),
    verifiedAt: timestamp("verifiedAt"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ tenantIdx: index("seller_direction_tenant_idx").on(t.tenantId) }),
);

// ─── Offers ─────────────────────────────────────────────────────────────────

export const offers = mysqlTable(
  "offers",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    propertyId: fk("propertyId", () => properties.id),
    buyerLabel: varchar("buyerLabel", { length: 255 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    documentText: text("documentText"), // stored extracted text (mock corpus)
    receivedAt: timestamp("receivedAt").notNull(),
    irrevocableUntil: timestamp("irrevocableUntil"),
    extractionConfidence: int("extractionConfidence"),
    status: mysqlEnum("status", [
      "received",
      "extracted",
      "under_review",
      "decided",
    ])
      .default("received")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    propertyIdx: index("offers_property_idx").on(t.propertyId),
    tenantIdx: index("offers_tenant_idx").on(t.tenantId),
  }),
);

export const offerTerms = mysqlTable(
  "offer_terms",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    offerId: fk("offerId", () => offers.id),
    field: varchar("field", { length: 80 }).notNull(),
    value: text("value"),
    sourcePage: int("sourcePage"),
    sourceSection: varchar("sourceSection", { length: 40 }),
    confidence: int("confidence"), // 0..100
    flag: varchar("flag", { length: 60 }), // none | missing | contradiction | unusual
    flagNote: text("flagNote"),
    verifiedBy: fkNull("verifiedBy", () => users.id),
    verifiedAt: timestamp("verifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ offerIdx: index("offer_terms_offer_idx").on(t.offerId) }),
);

export const offerComparisons = mysqlTable(
  "offer_comparisons",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    propertyId: fk("propertyId", () => properties.id),
    offerIds: json("offerIds").notNull(),
    summary: json("summary"),
    generatedBy: varchar("generatedBy", { length: 120 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ tenantIdx: index("offer_comparisons_tenant_idx").on(t.tenantId) }),
);

// ─── Transactions ───────────────────────────────────────────────────────────

export const transactions = mysqlTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    propertyId: fk("propertyId", () => properties.id),
    acceptedOfferId: fkNull("acceptedOfferId", () => offers.id),
    sellerName: varchar("sellerName", { length: 255 }),
    buyerName: varchar("buyerName", { length: 255 }),
    acceptedPrice: int("acceptedPrice"),
    acceptedAt: timestamp("acceptedAt"),
    closingAt: timestamp("closingAt"),
    status: mysqlEnum("status", [
      "conditional",
      "firm",
      "lawyer_handoff",
      "closed",
      "collapsed",
    ])
      .default("conditional")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ tenantIdx: index("transactions_tenant_idx").on(t.tenantId) }),
);

export const transactionTaskKindValues = [
  "condition",
  "deposit",
  "document",
  "reminder",
  "lawyer_handoff",
  "closing",
  "fintrac_idv",
  "fintrac_receipt_of_funds",
  "fintrac_third_party",
  "fintrac_pep",
  "fintrac_str",
  "other",
] as const;

export const transactionTasks = mysqlTable(
  "transaction_tasks",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    transactionId: fk("transactionId", () => transactions.id),
    kind: mysqlEnum("kind", transactionTaskKindValues)
      .default("other")
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    dueAt: timestamp("dueAt"),
    ownerRole: varchar("ownerRole", { length: 60 }),
    status: mysqlEnum("status", ["pending", "in_progress", "done", "waived"])
      .default("pending")
      .notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    transactionIdx: index("transaction_tasks_txn_idx").on(t.transactionId),
  }),
);

// ─── Workflows / durable execution ──────────────────────────────────────────

export const workflows = mysqlTable(
  "workflows",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    kind: varchar("kind", { length: 80 }).notNull(),
    subjectId: fkNullPoly("subjectId"),
    status: mysqlEnum("status", ["running", "waiting", "completed", "failed"])
      .default("running")
      .notNull(),
    currentStep: varchar("currentStep", { length: 120 }),
    state: json("state"),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ tenantIdx: index("workflows_tenant_idx").on(t.tenantId) }),
);

export const workflowEvents = mysqlTable(
  "workflow_events",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    workflowId: fk("workflowId", () => workflows.id),
    seq: int("seq").notNull(),
    type: varchar("type", { length: 80 }).notNull(),
    payload: json("payload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    wfSeq: uniqueIndex("workflow_events_wf_seq").on(t.workflowId, t.seq),
  }),
);

export const outbox = mysqlTable(
  "outbox",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    payload: json("payload").notNull(),
    status: mysqlEnum("status", ["pending", "sent", "failed", "blocked"])
      .default("pending")
      .notNull(),
    attempts: int("attempts").default(0).notNull(),
    policyDecisionId: fkNull("policyDecisionId", () => policyDecisions.id),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    sentAt: timestamp("sentAt"),
  },
  // F10: idempotency is per-tenant — one tenant's key never squats another's.
  // SEC-5: scope is (tenantId, action, idempotencyKey) — a cem.send row can
  // never squat the launch intent's key (cross-action-type squatting killed
  // approved campaign launches).
  (t) => ({ idemKey: uniqueIndex("outbox_tenant_idem").on(t.tenantId, t.action, t.idempotencyKey) }),
);

// ─── Audit ──────────────────────────────────────────────────────────────────

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    seq: int("seq").notNull(),
    tenantId: fk("tenantId", () => tenants.id),
    actorId: fkNull("actorId", () => users.id),
    actorRole: varchar("actorRole", { length: 60 }),
    action: varchar("action", { length: 120 }).notNull(),
    subjectType: varchar("subjectType", { length: 60 }).notNull(),
    subjectId: varchar("subjectId", { length: 80 }).notNull(),
    payloadHash: varchar("payloadHash", { length: 80 }).notNull(),
    policyDecisionId: fkNull("policyDecisionId", () => policyDecisions.id),
    modelVersion: varchar("modelVersion", { length: 60 }),
    promptVersion: varchar("promptVersion", { length: 60 }),
    prevHash: varchar("prevHash", { length: 80 }).notNull(),
    hash: varchar("hash", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    tenantSeq: uniqueIndex("audit_tenant_seq").on(t.tenantId, t.seq),
    tenantIdx: index("audit_tenant_idx").on(t.tenantId),
  }),
);

// ─── Policy ─────────────────────────────────────────────────────────────────

export const policyPacks = mysqlTable("policy_packs", {
  id: serial("id").primaryKey(),
  jurisdiction: varchar("jurisdiction", { length: 8 }).notNull(), // ON | BC | AB | QC | CA
  version: varchar("version", { length: 32 }).notNull(),
  effectiveDate: timestamp("effectiveDate").notNull(),
  reviewDate: timestamp("reviewDate"),
  owner: varchar("owner", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["production", "fixture_not_production", "draft"])
    .default("draft")
    .notNull(),
  disclaimer: text("disclaimer"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const policyRules = mysqlTable(
  "policy_rules",
  {
    id: serial("id").primaryKey(),
    tenantId: fkNull("tenantId", () => tenants.id), // null = global pack content
    packId: fk("packId", () => policyPacks.id),
    ruleId: varchar("ruleId", { length: 40 }).notNull(),
    sourceName: varchar("sourceName", { length: 255 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 500 }).notNull(),
    jurisdiction: varchar("jurisdiction", { length: 8 }).notNull(),
    effectiveDate: varchar("effectiveDate", { length: 20 }),
    reviewDate: varchar("reviewDate", { length: 20 }),
    owner: varchar("owner", { length: 255 }).notNull(),
    requirement: text("requirement").notNull(),
    control: json("control").notNull(),
    testScenarios: json("testScenarios").notNull(),
    escalationPath: varchar("escalationPath", { length: 255 }).notNull(),
    confidence: varchar("confidence", { length: 20 }),
    verifyNote: text("verifyNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ packIdx: index("policy_rules_pack_idx").on(t.packId) }),
);

export const policyDecisions = mysqlTable(
  "policy_decisions",
  {
    id: serial("id").primaryKey(),
    tenantId: fk("tenantId", () => tenants.id),
    ruleIds: json("ruleIds").notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    actor: varchar("actor", { length: 160 }).notNull(),
    verdict: mysqlEnum("verdict", ["allow", "block", "escalate"]).notNull(),
    reasons: json("reasons").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ tenantIdx: index("policy_decisions_tenant_idx").on(t.tenantId) }),
);

// ─── Integrations & model calls ─────────────────────────────────────────────

export const integrations = mysqlTable("integrations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  kind: varchar("kind", { length: 60 }).notNull(), // comms | listing_data | calendar | mls_ddf | model
  status: mysqlEnum("status", [
    "mock",
    "sandbox",
    "connected",
    "degraded",
    "not_connected",
  ]).notNull(),
  truthfulNote: text("truthfulNote").notNull(),
  config: json("config"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const modelCalls = mysqlTable(
  "model_calls",
  {
    id: serial("id").primaryKey(),
    tenantId: fkNull("tenantId", () => tenants.id),
    provider: varchar("provider", { length: 80 }).notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    promptVersion: varchar("promptVersion", { length: 60 }).notNull(),
    tokensIn: int("tokensIn").default(0).notNull(),
    tokensOut: int("tokensOut").default(0).notNull(),
    costCents: int("costCents").default(0).notNull(),
    sensitivity: varchar("sensitivity", { length: 40 })
      .default("standard")
      .notNull(),
    piiRedacted: boolean("piiRedacted").default(false).notNull(),
    durationMs: int("durationMs").default(0).notNull(),
    status: varchar("status", { length: 40 }).default("ok").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({ tenantIdx: index("model_calls_tenant_idx").on(t.tenantId) }),
);

export type Tenant = typeof tenants.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Dossier = typeof dossiers.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type OfferTerm = typeof offerTerms.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
export type PolicyDecisionRow = typeof policyDecisions.$inferSelect;
