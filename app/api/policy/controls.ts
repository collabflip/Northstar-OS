/**
 * Pure policy controls used by the commit-time engine (engine.ts), by agents
 * producing content, and directly by unit tests. No I/O — fully deterministic.
 */

// ── CASL CEM classifier ─────────────────────────────────────────────────────

const CEM_SIGNALS = [
  "listing", "for sale", "just listed", "open house", "price improvement",
  "special offer", "promotion", "discount", "buy now", "sell your home",
  "free valuation", "market update", "newsletter", "don't miss", "act now",
  "limited time", "book a consultation", "we can sell", "our services",
  "unsubscribe",
];

export interface CemClassification {
  isCem: boolean;
  signals: string[];
}

/** Heuristic CEM classifier: any commercial-activity encouragement signal. */
export function classifyCEM(body: string): CemClassification {
  const lower = body.toLowerCase();
  const signals = CEM_SIGNALS.filter((sig) => lower.includes(sig));
  return { isCem: signals.length > 0, signals };
}

// ── Implied consent windows (CASL-03 / DNCL-06) ─────────────────────────────

export function addMonths(d: Date, months: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

/** CASL implied consent: EBR 24 months, inquiry 6 months. */
export function caslImpliedExpiry(
  basis: "ebr" | "inquiry",
  capturedAt: Date,
): Date {
  return addMonths(capturedAt, basis === "ebr" ? 24 : 6);
}

/** DNCL EBR exemption: purchase/lease 18 months, inquiry 6 months. */
export function dnclExemptionExpiry(
  basis: "ebr" | "inquiry",
  capturedAt: Date,
): Date {
  return addMonths(capturedAt, basis === "ebr" ? 18 : 6);
}

// ── DNCL calling hours (DNCL-04) ────────────────────────────────────────────

export interface CallingHoursResult {
  within: boolean;
  localTime: string; // e.g. "2026-06-10 21:45"
  dayType: "weekday" | "weekend";
  timezone: string;
}

/**
 * Telemarketing window: 9:00-21:30 Mon-Fri, 10:00-18:00 Sat-Sun,
 * evaluated in the consumer's local timezone (default America/Toronto).
 */
/** F6: validate an IANA timezone name (used to detect ambiguous zones). */
export function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function callingHours(
  now: Date,
  timezone = "America/Toronto",
): CallingHoursResult {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch {
    // Unknown timezone → ambiguous → fail closed (outside window)
    return {
      within: false,
      localTime: "unknown-timezone",
      dayType: "weekday",
      timezone,
    };
  }
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const hour = parseInt(get("hour"), 10) % 24;
  const minute = parseInt(get("minute"), 10);
  const minutes = hour * 60 + minute;
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const start = isWeekend ? 10 * 60 : 9 * 60;
  const end = isWeekend ? 18 * 60 : 21 * 60 + 30;
  return {
    within: minutes >= start && minutes < end,
    localTime: `${get("year")}-${get("month")}-${get("day")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    dayType: isWeekend ? "weekend" : "weekday",
    timezone,
  };
}

// ── Human-rights lexicon linter (HR-02/HR-03/HR-04) ─────────────────────────

export interface LintViolation {
  term: string;
  ground: string;
  ruleIds: string[];
  message: string;
}

const HR_LEXICON: { term: string; ground: string }[] = [
  // family status proxies
  { term: "no children", ground: "family status" },
  { term: "not suitable for kids", ground: "family status" },
  { term: "adults only", ground: "family status / age" },
  { term: "adult building", ground: "family status / age" },
  { term: "ideal for singles", ground: "family status / marital status" },
  { term: "perfect for singles", ground: "family status / marital status" },
  { term: "no families", ground: "family status" },
  { term: "child-free", ground: "family status" },
  { term: "empty nester", ground: "family status / age" },
  { term: "young couple", ground: "age / marital status" },
  // public assistance (Ontario accommodation ground)
  { term: "no ow", ground: "receipt of public assistance" },
  { term: "ontario works", ground: "receipt of public assistance" },
  { term: "no odsp", ground: "receipt of public assistance" },
  { term: "public assistance", ground: "receipt of public assistance" },
  { term: "welfare", ground: "receipt of public assistance" },
  { term: "no housing subsidy", ground: "receipt of public assistance" },
  // ethnicity / religion / origin proxies
  { term: "christian", ground: "creed" },
  { term: "muslim", ground: "creed" },
  { term: "jewish", ground: "creed" },
  { term: "ethnic neighbourhood", ground: "ethnic origin" },
  { term: "ethnic makeup", ground: "ethnic origin" },
  { term: "english only", ground: "place of origin / ancestry" },
  { term: "canadians only", ground: "citizenship" },
  { term: "no foreigners", ground: "citizenship / national origin" },
  // disability
  { term: "no wheelchairs", ground: "disability" },
  { term: "able-bodied", ground: "disability" },
];

/** Lint ad/listing/criteria text against the prohibited-grounds lexicon. */
export function humanRightsLint(text: string): LintViolation[] {
  const lower = text.toLowerCase();
  const violations: LintViolation[] = [];
  for (const { term, ground } of HR_LEXICON) {
    if (lower.includes(term)) {
      violations.push({
        term,
        ground,
        ruleIds: ["HR-02", "HR-03"],
        message: `Phrase "${term}" is a prohibited-grounds proxy (${ground}); human rewrite required.`,
      });
    }
  }
  return violations;
}

// ── SRP advice guardrail (TRESA-04) ─────────────────────────────────────────

const SRP_ADVICE_PATTERNS = [
  /should i (offer|bid|pay)/i,
  /what should i (offer|bid|pay)/i,
  /is this a (good|fair) (price|deal)/i,
  /negotiat/i,
  /counter[- ]?offer/i,
  /what is the lowest/i,
  /lowest they'?ll (take|accept)/i,
  /my (best|legal) (interest|option)/i,
  /draft(ing)? (an|the|my) offer/i,
  /fill out (the|my) (form|offer|agreement)/i,
  /advice/i,
];

/**
 * True when text is advice/opinion/pricing/negotiation/form-help — categories
 * a registrant must NOT provide to a self-represented party.
 */
export function isSrpRestrictedAssistance(text: string): {
  restricted: boolean;
  matched: string[];
} {
  const matched = SRP_ADVICE_PATTERNS.filter((re) => re.test(text)).map((re) =>
    String(re.source),
  );
  return { restricted: matched.length > 0, matched };
}

// ── Advertising identification linter (TRESA-06) ────────────────────────────

export function adIdentificationLint(
  text: string,
  identity: { registeredName: string; category: string; brokerageName: string },
): { missing: string[] } {
  const lower = text.toLowerCase();
  const missing: string[] = [];
  if (!lower.includes(identity.registeredName.toLowerCase()))
    missing.push("registeredName");
  if (!lower.includes(identity.category.toLowerCase()))
    missing.push("category");
  if (!lower.includes(identity.brokerageName.toLowerCase()))
    missing.push("brokerageName");
  return { missing };
}

// ── Claim-vs-data cross-check (TRESA-07) ────────────────────────────────────

export interface ClaimCheckResult {
  unsupported: string[];
  checked: number;
}

/**
 * Every factual claim in generated copy must appear in (or be entailed by)
 * the structured property facts. Heuristic: normalize and substring-check
 * each claim against the fact corpus; numbers must match exactly.
 */
export function claimCrossCheck(
  claims: string[],
  factCorpus: string[],
): ClaimCheckResult {
  const corpus = factCorpus.join("\n").toLowerCase();
  const unsupported: string[] = [];
  for (const claim of claims) {
    const c = claim.toLowerCase().trim();
    if (c.length === 0) continue;
    const numbers = c.match(/\d[\d,]*/g) ?? [];
    const numbersOk = numbers.every((n) => corpus.includes(n));
    const wordsOk = c
      .split(/[^a-z]+/)
      .filter((w) => w.length > 4)
      .every((w) => corpus.includes(w));
    if (!numbersOk || !wordsOk) unsupported.push(claim);
  }
  return { unsupported, checked: claims.length };
}

// ── Contact province tagging / fail-closed jurisdiction (PIPEDA-07, COMP-3) ─

/**
 * True when a contact's tagged province of residence falls OUTSIDE the
 * production pack scope (the set of jurisdictions whose policy packs are
 * production — currently Ontario only; the BC/AB/QC packs are fixtures).
 *
 * A gated action whose subject contact is out-of-scope must FAIL CLOSED to
 * manual review (escalate) — it is never silently evaluated under the
 * tenant's pack rules. Unknown/null/blank province → false: the action is
 * evaluated under the tenant pack (documented behavior — tagging is additive;
 * untagged contacts keep the legacy tenant-scope handling).
 */
export function contactOutsideProductionScope(
  contactProvince: string | null | undefined,
  productionScope: readonly string[],
): boolean {
  const province = contactProvince?.trim().toUpperCase();
  if (!province) return false;
  return !productionScope.includes(province);
}

// ── DNCL scrub staleness (DNCL-02) ──────────────────────────────────────────

export function dnclScrubStale(
  scrubbedAt: Date | null | undefined,
  now: Date,
  maxAgeDays = 31,
): boolean {
  if (!scrubbedAt) return true;
  return now.getTime() - scrubbedAt.getTime() > maxAgeDays * 24 * 60 * 60 * 1000;
}
