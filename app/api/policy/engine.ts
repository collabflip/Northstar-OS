import { actionPayloadHash, approvalBindsAction } from "./actionHash";
import type { Store } from "../store/types";
import {
  callingHours,
  classifyCEM,
  contactOutsideProductionScope,
  dnclScrubStale,
  humanRightsLint,
  isSrpRestrictedAssistance,
  isValidIanaTimezone,
} from "./controls";
import { ON_PACK } from "./packs/on";
import { BC_PACK } from "./packs/bc";
import { AB_PACK } from "./packs/ab";
import { QC_PACK } from "./packs/qc";
import type { PolicyPack } from "./types";

/**
 * Commit-time policy gate (ARCHITECTURE_CONTRACT §Policy kernel).
 *
 * Runs FRESH before every external side effect. Sixteen checks; any missing,
 * stale, conflicting or ambiguous authority or evidence FAILS CLOSED
 * (block, or escalate to a human where the contract routes decisions there).
 * Every evaluation — allow, block or escalate — persists a policy_decisions row.
 */

export const CHECK_NAMES = [
  "tenant",
  "actor",
  "role",
  "autonomy_ceiling",
  "jurisdiction",
  "contact_jurisdiction",
  "brokerage_policy",
  "consent",
  "suppression",
  "purpose",
  "approval_freshness",
  "data_freshness",
  "payload_destination_binding",
  "budget_frequency",
  "idempotency",
  "audit_fields",
] as const;

export type CheckName = (typeof CHECK_NAMES)[number];

export interface CheckResult {
  check: CheckName;
  ok: boolean;
  verdict?: "block" | "escalate"; // absent when ok
  ruleIds: string[];
  message: string;
}

export interface EvalContext {
  tenantId: number;
  actorId: number;
  /** Evaluated-at time (injectable for deterministic tests). */
  now?: Date;
  /** Actor's declared brokerage policy version; must match tenant's. */
  brokeragePolicyVersion?: string;
}

export interface ActionInput {
  kind: string;
  payload: unknown;
  destination: string;
  idempotencyKey: string;
  jurisdiction?: string; // defaults to tenant province
  contactId?: number;
  channel?: "email" | "sms" | "voice" | "dm";
  purpose?: string;
  text?: string; // message/content body for classifiers & linters
  marketing?: boolean; // force CEM treatment
  transactionalJustification?: string;
  campaignId?: number;
  budgetCapCents?: number;
  frequencyCapPerWeek?: number;
  costCents?: number;
  requiresApproval?: boolean;
  approvalId?: number;
  /** Requested autonomy level for this action (A0–A4). */
  autonomyLevel?: "A0" | "A1" | "A2" | "A3" | "A4";
  /** Risk class of the action; defaults from the action kind when omitted. */
  riskClass?: "low" | "medium" | "high" | "regulated";
  approvalTtlHours?: number; // default 48
  dataDependent?: boolean;
  dataAsOf?: Date;
  maxDataAgeHours?: number; // default 72
  agentGenerated?: boolean;
  audit?: { modelVersion?: string; promptVersion?: string };
  /** DNCL registration configured for the tenant (DNCL-01). */
  dnclRegistered?: boolean;
  /** Uses AI/prerecorded voice (DNCL-07 — presumptively prohibited). */
  aiVoice?: boolean;
}

export interface PolicyDecisionResult {
  decisionId: number;
  verdict: "allow" | "block" | "escalate";
  checks: CheckResult[];
  ruleIds: string[];
}

const PACKS: Record<string, PolicyPack> = {
  ON: ON_PACK,
  BC: BC_PACK,
  AB: AB_PACK,
  QC: QC_PACK,
};

export function getPack(jurisdiction: string): PolicyPack | undefined {
  return PACKS[jurisdiction];
}

/** Jurisdictions whose packs are production (currently ON only — BC/AB/QC are fixtures). */
const PRODUCTION_SCOPE = Object.keys(PACKS).filter((j) => PACKS[j].status === "production");

// ── role authorization matrix ────────────────────────────────────────────────

const BOR_ONLY = new Set([
  "publish.listing_copy",
  "offer.record_decision",
  "strategy.approve",
]);
const REGISTRANT_KINDS = new Set([
  "cem.send",
  "call.place",
  "campaign.launch",
  "transaction.update_send",
  "offer.disclose_content",
  "data.export",
]);
const REGISTRANT_ROLES = new Set([
  "solo_registrant",
  "team_member",
  "brokerage_admin",
  "marketing_coordinator",
  "transaction_coordinator",
]);

export function roleAllowed(role: string, kind: string): boolean {
  // FIN-07 anti-tipping-off: fintrac.* is fintrac_officer ONLY — evaluated
  // first so even broker_of_record cannot bypass the queue isolation.
  if (kind.startsWith("fintrac.")) return role === "fintrac_officer";
  if (role === "broker_of_record") return true;
  if (BOR_ONLY.has(kind)) return false; // broker of record only
  if (REGISTRANT_KINDS.has(kind)) return REGISTRANT_ROLES.has(role);
  return REGISTRANT_ROLES.has(role);
}

const KNOWN_KINDS = new Set([
  ...BOR_ONLY,
  ...REGISTRANT_KINDS,
  "fintrac.str_file",
  "fintrac.review",
  "compliance.view",
]);

// ── F9: autonomy ceiling ─────────────────────────────────────────────────────

const AUTONOMY_RANK: Record<string, number> = { A0: 0, A1: 1, A2: 2, A3: 3, A4: 4 };

/** Default risk class per action kind (explicit override via action.riskClass). */
const RISK_BY_KIND: Record<string, "low" | "medium" | "high" | "regulated"> = {
  "cem.send": "medium",
  "call.place": "medium",
  "campaign.launch": "high",
  "transaction.update_send": "medium",
  "offer.disclose_content": "high",
  "offer.record_decision": "high",
  "publish.listing_copy": "high",
  "strategy.approve": "medium",
  "data.export": "high",
  "fintrac.str_file": "regulated",
  "fintrac.review": "regulated",
  "compliance.view": "low",
};

/**
 * Effective ceiling for an action: the tenant's configured ceiling, capped at
 * A1 for high-risk/regulated classes (intended defaults: A1 high-risk, A2
 * otherwise). Anything requested above the effective ceiling fails closed to
 * human approval.
 */
export function effectiveAutonomyCeiling(
  tenantCeiling: string,
  riskClass: "low" | "medium" | "high" | "regulated",
): string {
  const tenant = AUTONOMY_RANK[tenantCeiling] ?? AUTONOMY_RANK.A2;
  const classCap =
    riskClass === "high" || riskClass === "regulated" ? AUTONOMY_RANK.A1 : AUTONOMY_RANK.A4;
  const effective = Math.min(tenant, classCap);
  return `A${effective}`;
}

const IDEM_RE = /^[A-Za-z0-9_:\-.]{8,160}$/;

function fail(
  check: CheckName,
  verdict: "block" | "escalate",
  message: string,
  ruleIds: string[] = [],
): CheckResult {
  return { check, ok: false, verdict, ruleIds, message };
}
function pass(check: CheckName, message = "ok", ruleIds: string[] = []): CheckResult {
  return { check, ok: true, ruleIds, message };
}

/**
 * Run all 16 checks fresh at commit time. Never throws for policy reasons —
 * unexpected errors fail closed. Persists + returns the decision.
 */
export async function evaluateAction(
  store: Store,
  ctx: EvalContext,
  action: ActionInput,
): Promise<PolicyDecisionResult> {
  const now = ctx.now ?? new Date();
  const checks: CheckResult[] = [];
  try {
    // 1 — tenant
    const tenant = await store.getTenant(ctx.tenantId);
    checks.push(
      tenant
        ? pass("tenant", `tenant ${tenant.name}`)
        : fail("tenant", "block", `tenant ${ctx.tenantId} not found — fail closed`),
    );

    // 2 — actor
    const membership = tenant
      ? await store.getMembership(ctx.tenantId, ctx.actorId)
      : undefined;
    checks.push(
      membership
        ? pass("actor", `actor ${ctx.actorId} role ${membership.role}`)
        : fail("actor", "block", `actor ${ctx.actorId} has no membership in tenant — fail closed`),
    );

    // 3 — role / authorization
    if (!KNOWN_KINDS.has(action.kind)) {
      checks.push(
        fail("role", "block", `unknown action kind "${action.kind}" — fail closed`),
      );
    } else if (membership && !roleAllowed(membership.role, action.kind)) {
      const ruleIds = action.kind.startsWith("fintrac.") ? ["FIN-07"] : [];
      checks.push(
        fail(
          "role",
          "block",
          `role ${membership.role} may not perform ${action.kind}`,
          ruleIds,
        ),
      );
    } else {
      checks.push(pass("role"));
    }

    // 3b — F9 autonomy ceiling: effective autonomy = min(requested, tenant
    // ceiling for the action's risk class). Above ceiling → human approval
    // (escalate, fail closed) — the asserted level never executes as-is.
    if (action.autonomyLevel === undefined) {
      checks.push(pass("autonomy_ceiling", "n/a — no autonomy level asserted"));
    } else {
      const riskClass = action.riskClass ?? RISK_BY_KIND[action.kind] ?? "medium";
      const ceiling = effectiveAutonomyCeiling(tenant?.autonomyCeiling ?? "A2", riskClass);
      const requestedRank = AUTONOMY_RANK[action.autonomyLevel] ?? Number.MAX_SAFE_INTEGER;
      if (requestedRank > AUTONOMY_RANK[ceiling]) {
        if (action.approvalId !== undefined) {
          // Above-ceiling action referenced an approval — freshness/binding is
          // enforced by the approval checks; it executes under human approval,
          // not autonomously.
          checks.push(
            pass("autonomy_ceiling", `${action.autonomyLevel} above ceiling ${ceiling} — proceeding only under human approval ${action.approvalId}`),
          );
        } else {
          checks.push(
            fail(
              "autonomy_ceiling",
              "escalate",
              `requested autonomy ${action.autonomyLevel} exceeds effective ceiling ${ceiling} (tenant ${tenant?.autonomyCeiling ?? "A2"}, risk ${riskClass}) — requires human approval`,
            ),
          );
        }
      } else {
        checks.push(pass("autonomy_ceiling", `${action.autonomyLevel} within ceiling ${ceiling} (risk ${riskClass})`));
      }
    }

    // 4 — jurisdiction (pack must exist and be production)
    const jurisdiction = action.jurisdiction ?? tenant?.province ?? "ON";
    const pack = PACKS[jurisdiction];
    if (!pack) {
      checks.push(
        fail("jurisdiction", "block", `no policy pack for ${jurisdiction} — fail closed`),
      );
    } else if (pack.status !== "production") {
      checks.push(
        fail(
          "jurisdiction",
          "block",
          `${jurisdiction} pack status is ${pack.status} (not production) — fail closed`,
        ),
      );
    } else {
      checks.push(pass("jurisdiction", `${jurisdiction} pack v${pack.version}`));
    }

    // 5 — brokerage policy version alignment
    const actorPolicy = ctx.brokeragePolicyVersion ?? tenant?.brokeragePolicyVersion;
    if (!tenant || !actorPolicy || actorPolicy !== tenant.brokeragePolicyVersion) {
      checks.push(
        fail(
          "brokerage_policy",
          "block",
          `brokerage policy mismatch (actor ${actorPolicy ?? "none"} vs tenant ${tenant?.brokeragePolicyVersion ?? "unknown"}) — fail closed`,
        ),
      );
    } else {
      checks.push(pass("brokerage_policy", `v${actorPolicy}`));
    }

    // contact-dependent controls (6, 7, 8)
    const contact =
      action.contactId !== undefined
        ? await store.getContact(ctx.tenantId, action.contactId)
        : undefined;
    const contactFacing =
      action.contactId !== undefined && action.channel !== undefined;

    // 4b — contact_jurisdiction (PIPEDA-07 / COMP-3): a contact tagged with a
    // province outside the production pack scope (BC/AB/QC in an ON tenant —
    // the fixture packs are non-production) FAILS CLOSED to manual review
    // instead of being silently evaluated under the tenant's rules.
    // Unknown/null province → evaluated under the tenant pack (documented).
    // (The Store ContactRecord type predates the contacts.province column, so
    // the tag is read off the row via a widened type.)
    const contactProvince =
      (contact as { province?: string | null } | undefined)?.province ?? null;
    checks.push(
      contactOutsideProductionScope(contactProvince, PRODUCTION_SCOPE)
        ? fail(
            "contact_jurisdiction",
            "escalate",
            `contact ${contact!.id} province ${contactProvince} is outside the production pack scope (${PRODUCTION_SCOPE.join("/")}) — manual review required; never silently evaluate under ${jurisdiction} rules`,
            ["PIPEDA-07"],
          )
        : pass(
            "contact_jurisdiction",
            contactProvince
              ? `contact province ${contactProvince} within production scope`
              : "contact province untagged — tenant pack applies",
          ),
    );

    // 6 — consent (CASL) + voice/DNCL controls
    if (!contactFacing) {
      checks.push(pass("consent", "n/a — no contact channel"));
    } else if (!contact) {
      checks.push(
        fail("consent", "block", `contact ${action.contactId} not found in tenant — fail closed`),
      );
    } else {
      checks.push(...(await consentChecks(store, ctx.tenantId, contact, action, tenant?.timezone ?? "America/Toronto", now, tenant?.dnclPosture)));
    }

    // 7 — suppression
    if (!contactFacing || !contact) {
      checks.push(
        contactFacing
          ? fail("suppression", "block", "contact unresolved — fail closed", ["CASL-06"])
          : pass("suppression", "n/a"),
      );
    } else {
      const suppressed = await store.isSuppressed(
        ctx.tenantId,
        contact.id,
        action.channel!,
      );
      if (suppressed) {
        checks.push(
          fail("suppression", "block", `contact ${contact.id} is suppressed on ${action.channel} (CASL s.11 hard-block)`, ["CASL-06"]),
        );
      } else if (action.channel === "voice" && contact.onInternalDnc) {
        checks.push(
          fail("suppression", "block", `contact ${contact.id} on internal do-not-call list`, ["DNCL-03"]),
        );
      } else {
        checks.push(pass("suppression"));
      }
    }

    // 8 — purpose (PIPEDA purpose limitation)
    if (!contactFacing) {
      checks.push(pass("purpose", "n/a"));
    } else if (!action.purpose) {
      checks.push(
        fail("purpose", "block", "no declared purpose for contact-facing action — fail closed", ["PIPEDA-02"]),
      );
    } else if (contact) {
      const consent = await store.latestConsent(ctx.tenantId, contact.id, action.channel!);
      if (consent?.purpose && consent.purpose !== action.purpose) {
        checks.push(
          fail("purpose", "block", `purpose "${action.purpose}" exceeds consented purpose "${consent.purpose}" — new purpose requires fresh consent`, ["PIPEDA-02"]),
        );
      } else {
        checks.push(pass("purpose", `purpose "${action.purpose}"`));
      }
    } else {
      checks.push(fail("purpose", "block", "contact unresolved — fail closed", ["PIPEDA-02"]));
    }

    // 9 + 11 — approval freshness & payload↔destination binding
    let approval;
    if (action.approvalId !== undefined) {
      approval = await store.getApproval(ctx.tenantId, action.approvalId);
    }
    if (action.requiresApproval || action.approvalId !== undefined) {
      if (!approval) {
        checks.push(
          fail("approval_freshness", "escalate", "approval required but none referenced — routed to Approval Inbox"),
        );
        checks.push(
          fail("payload_destination_binding", "escalate", "no approved payload to bind — fail closed"),
        );
      } else {
        // SEC-6: approvals are single-use — a consumed approval is invalid
        // even inside its 48h TTL (no replay of the gated action).
        const consumed = approval.usedAt != null;
        const ttlHours = action.approvalTtlHours ?? 48;
        const decidedAt = approval.decidedAt ?? approval.createdAt;
        const ageMs = now.getTime() - decidedAt.getTime();
        const fresh =
          !consumed &&
          approval.status === "approved" &&
          approval.expiresAt.getTime() > now.getTime() &&
          ageMs <= ttlHours * 60 * 60 * 1000;
        checks.push(
          consumed
            ? fail("approval_freshness", "block", `approval ${approval.id} already consumed (single-use) — re-approval required`)
            : fresh
              ? pass("approval_freshness", `approved ${Math.round(ageMs / 3600000)}h ago within ${ttlHours}h TTL`)
              : fail("approval_freshness", "block", `approval ${approval.id} stale/expired/not-approved (status ${approval.status}) — re-review required`),
        );
        // F5: canonical hash — identical function used at approval creation
        // and in the drainer, so a decided approval always matches.
        const boundHash = actionPayloadHash({
          kind: action.kind,
          payload: action.payload,
          destination: action.destination,
        });
        if (approvalBindsAction(approval, { kind: action.kind, payload: action.payload, destination: action.destination })) {
          checks.push(pass("payload_destination_binding", `hash ${boundHash.slice(0, 18)}… ↔ ${action.destination}`));
        } else {
          checks.push(
            fail("payload_destination_binding", "block", `payload/destination does not exactly match approval ${approval.id} — approve exact payload first`),
          );
        }
      }
    } else {
      checks.push(pass("approval_freshness", "n/a — no approval required"));
      checks.push(pass("payload_destination_binding", "n/a"));
    }

    // 10 — data freshness
    if (action.dataDependent) {
      if (!action.dataAsOf) {
        checks.push(
          fail("data_freshness", "escalate", "data-dependent action without data timestamp — manual review", []),
        );
      } else {
        const maxAge = action.maxDataAgeHours ?? 72;
        const ageH = (now.getTime() - action.dataAsOf.getTime()) / 3600000;
        checks.push(
          ageH <= maxAge
            ? pass("data_freshness", `data ${Math.round(ageH)}h old ≤ ${maxAge}h`)
            : fail("data_freshness", "block", `underlying data ${Math.round(ageH)}h old exceeds ${maxAge}h — refresh required`),
        );
      }
    } else {
      checks.push(pass("data_freshness", "n/a"));
    }

    // 12 — budget / frequency
    if (action.campaignId !== undefined) {
      const spend = await store.campaignSpendCents(ctx.tenantId, action.campaignId);
      if (
        action.budgetCapCents !== undefined &&
        spend + (action.costCents ?? 0) > action.budgetCapCents
      ) {
        checks.push(
          fail("budget_frequency", "block", `campaign budget exceeded (${spend} + ${action.costCents ?? 0} > cap ${action.budgetCapCents} cents)`, ["CASL-08"]),
        );
      } else if (
        action.frequencyCapPerWeek !== undefined &&
        contact &&
        action.channel
      ) {
        const recent = await store.recentSendCount(ctx.tenantId, contact.id, action.channel, 7);
        checks.push(
          recent >= action.frequencyCapPerWeek
            ? fail("budget_frequency", "block", `frequency cap reached: ${recent}/${action.frequencyCapPerWeek} sends this week`, ["CASL-08"])
            : pass("budget_frequency", `frequency ${recent}/${action.frequencyCapPerWeek} this week`),
        );
      } else {
        checks.push(pass("budget_frequency"));
      }
    } else {
      checks.push(pass("budget_frequency", "n/a"));
    }

    // 13 — idempotency
    if (!IDEM_RE.test(action.idempotencyKey)) {
      checks.push(
        fail("idempotency", "block", `idempotency key "${action.idempotencyKey}" missing/malformed — fail closed`),
      );
    } else {
      // F10 + SEC-5: idempotency is (tenant, action)-scoped — no cross-tenant
      // or cross-action-type key squatting.
      const existing = await store.getOutboxByKey(ctx.tenantId, action.kind, action.idempotencyKey);
      if (existing && existing.status === "sent") {
        checks.push(
          fail("idempotency", "block", `idempotency key already sent (outbox ${existing.id}) — duplicate suppressed`),
        );
      } else {
        checks.push(pass("idempotency", existing ? "key known (retry)" : "key fresh"));
      }
    }

    // 14 — audit fields
    if (action.agentGenerated) {
      const mv = action.audit?.modelVersion;
      const pv = action.audit?.promptVersion;
      checks.push(
        mv && pv
          ? pass("audit_fields", `model ${mv} prompt ${pv}`)
          : fail("audit_fields", "block", "agent-generated action missing modelVersion/promptVersion — fail closed"),
      );
    } else {
      checks.push(pass("audit_fields", "human-initiated"));
    }

    // content linters (additional hard gates folded into the gate run)
    if (action.text) {
      const hrHits = humanRightsLint(action.text);
      if (hrHits.length > 0) {
        checks.push({
          check: "purpose",
          ok: false,
          verdict: "escalate",
          ruleIds: ["HR-02", "HR-03"],
          message: `human-rights linter: ${hrHits.map((h) => `"${h.term}" (${h.ground})`).join(", ")} — human rewrite required`,
        });
      }
      if (contact?.isSrp) {
        const srp = isSrpRestrictedAssistance(action.text);
        if (srp.restricted) {
          checks.push({
            check: "consent",
            ok: false,
            verdict: "block",
            ruleIds: ["TRESA-04"],
            message: "SRP-flagged contact: advice/opinion/negotiation assistance prohibited",
          });
        }
      }
    }

    // TRESA-08 offer-content disclosure lock — F8: requires a PERSISTED
    // seller_direction_artifacts row in the same tenant. Caller-asserted
    // booleans (writtenSellerDirection: true) are ignored.
    if (action.kind === "offer.disclose_content") {
      const p = action.payload as { sellerDirectionArtifactId?: number } | null;
      const artifactId = p?.sellerDirectionArtifactId;
      const artifact =
        typeof artifactId === "number"
          ? await store.getSellerDirectionArtifact(ctx.tenantId, artifactId)
          : undefined;
      if (!artifact || artifact.status === "revoked") {
        checks.push({
          check: "role",
          ok: false,
          verdict: "block",
          ruleIds: ["TRESA-08"],
          message:
            "competing-offer CONTENT requires a persisted, non-revoked written seller direction artifact in this tenant (sellerDirectionArtifactId) — asserted flags are not evidence",
        });
      }
    }
  } catch (err) {
    // fail closed on ANY unexpected error
    checks.length = 0;
    checks.push({
      check: "tenant",
      ok: false,
      verdict: "block",
      ruleIds: [],
      message: `gate error: ${(err as Error).message} — fail closed`,
    });
  }

  const verdict: "allow" | "block" | "escalate" = checks.some(
    (c) => !c.ok && c.verdict === "block",
  )
    ? "block"
    : checks.some((c) => !c.ok && c.verdict === "escalate")
      ? "escalate"
      : "allow";

  const ruleIds = [...new Set(checks.flatMap((c) => c.ruleIds))];
  const actorLabel = membershipActorLabel(ctx);
  const decisionId = await store.recordPolicyDecision({
    tenantId: ctx.tenantId,
    ruleIds,
    action: action.kind,
    actor: actorLabel,
    verdict,
    reasons: checks,
    idempotencyKey: action.idempotencyKey,
  });
  return { decisionId, verdict, checks, ruleIds };
}

function membershipActorLabel(ctx: EvalContext): string {
  return `user:${ctx.actorId}@tenant:${ctx.tenantId}`;
}

// ── consent + voice sub-checks (check 6) ─────────────────────────────────────

async function consentChecks(
  store: Store,
  tenantId: number,
  contact: { id: number; onDncl: boolean; dnclScrubbedAt?: Date | null; timezone?: string | null },
  action: ActionInput,
  timezone: string,
  now: Date,
  dnclPosture?: string,
): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const channel = action.channel!;

  if (channel === "voice") {
    // F6: tenant DNCL posture — an unregistered brokerage can never place calls.
    if (dnclPosture === "unregistered") {
      out.push(fail("consent", "block", "tenant DNCL posture is unregistered — outbound calling disabled", ["DNCL-01"]));
      return out;
    }
    // DNCL-01 registration
    if (action.dnclRegistered === false) {
      out.push(fail("consent", "block", "DNCL registration/subscription not configured — outbound calling disabled", ["DNCL-01"]));
      return out;
    }
    // DNCL-07 AI voice presumptively prohibited
    if (action.aiVoice) {
      out.push(fail("consent", "block", "AI/prerecorded voice solicitation is presumptively prohibited (ADAD)", ["DNCL-07"]));
      return out;
    }
    // F6: DNCL-04 calling hours resolve in the CALLED PARTY's timezone when
    // known; ambiguous (unparsable) contact timezone → manual review; unknown
    // → fall back to the tenant timezone.
    let callTimezone = timezone;
    if (contact.timezone) {
      if (!isValidIanaTimezone(contact.timezone)) {
        out.push(
          fail("consent", "escalate", `contact timezone "${contact.timezone}" is not a valid IANA zone — ambiguous, manual review before calling`, ["DNCL-04"]),
        );
        return out;
      }
      callTimezone = contact.timezone;
    }
    const hours = callingHours(now, callTimezone);
    if (!hours.within) {
      out.push(
        fail("consent", "block", `outside calling hours (${hours.localTime} ${callTimezone}; window 9:00-21:30 M-F / 10:00-18:00 S-S)`, ["DNCL-04"]),
      );
      return out;
    }
    // DNCL-02 registry scrub
    if (contact.onDncl) {
      if (dnclScrubStale(contact.dnclScrubbedAt ?? null, now)) {
        out.push(fail("consent", "block", "DNCL scrub list stale (>31d) — dialer locked", ["DNCL-02"]));
        return out;
      }
      // DNCL-06: EBR exemption via active implied consent
      const consent = await store.latestConsent(tenantId, contact.id, channel);
      const exempt =
        consent &&
        consent.status === "active" &&
        consent.basis !== "none" &&
        consent.expiresAt &&
        consent.expiresAt.getTime() > now.getTime();
      if (!exempt) {
        out.push(fail("consent", "block", `number on DNCL without valid EBR exemption`, ["DNCL-02", "DNCL-06"]));
        return out;
      }
      out.push(pass("consent", "DNCL-registered but valid EBR exemption", ["DNCL-06"]));
      return out;
    }
    // F6: voice fails CLOSED on omitted DNCL/consent flags — the caller must
    // explicitly assert registration status; undefined is not "ok".
    if (action.dnclRegistered === undefined) {
      out.push(
        fail("consent", "block", "voice call without asserted DNCL registration flag — omitted flags fail closed", ["DNCL-01"]),
      );
      return out;
    }
    out.push(pass("consent", "voice call within hours, not DNCL-flagged", ["DNCL-04"]));
    return out;
  }

  // email / sms / dm → CASL CEM path
  const body = action.text ?? "";
  const cem = action.marketing || classifyCEM(body).isCem;
  if (!cem) {
    if (!action.transactionalJustification) {
      out.push(
        fail("consent", "escalate", "non-CEM classification without logged transactional justification — ambiguous, manual review", ["CASL-01"]),
      );
    } else {
      out.push(pass("consent", "transactional (non-CEM), justification logged", ["CASL-01"]));
    }
    return out;
  }

  const consent = await store.latestConsent(tenantId, contact.id, channel);
  if (!consent || consent.basis === "none" || consent.status === "withdrawn") {
    out.push(
      fail("consent", "block", `CEM to contact ${contact.id} on ${channel} with no consent basis — fail closed`, ["CASL-01"]),
    );
    return out;
  }
  if (!consent.evidenceText && !consent.source) {
    out.push(
      fail("consent", "escalate", "consent record lacks evidence/source — sender bears onus of proof", ["CASL-07"]),
    );
    return out;
  }
  if (consent.status === "expired") {
    out.push(
      fail("consent", "block", `${consent.basis} consent expired (record status)`, ["CASL-03"]),
    );
    return out;
  }
  if (consent.basis === "implied") {
    if (!consent.expiresAt) {
      out.push(
        fail("consent", "block", "implied consent without window expiry — ambiguous, fail closed", ["CASL-03"]),
      );
      return out;
    }
    if (consent.expiresAt.getTime() <= now.getTime()) {
      out.push(
        fail("consent", "block", `implied consent window closed ${consent.expiresAt.toISOString().slice(0, 10)} (EBR 2y / inquiry 6mo)`, ["CASL-03"]),
      );
      return out;
    }
  }
  out.push(
    pass("consent", `${consent.basis} consent active on ${channel}`, [
      consent.basis === "implied" ? "CASL-03" : "CASL-02",
    ]),
  );
  return out;
}
