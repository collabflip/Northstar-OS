# Cost Model — Northstar SellerOS (per-tenant monthly)

Honest, assumption-first cost model. All figures are **estimates in CAD**, for planning only — verify against current provider pricing before committing. Two cost planes: (1) infrastructure, (2) model gateway. **Default configuration (mock provider) has $0 model cost** (ADR-004).

## 1. Model-usage assumptions (per full seller journey)

A "seller journey" = lead capture → consent → dossier → valuation → strategy → approval → campaign draft → inquiry handling → offer extraction (2 offers) → transaction coordination kickoff.

| Journey stage | Model calls | Avg tokens in / out per call | Notes |
|---|---|---|---|
| Intake routing + identity + consent summary | 3 | 1,200 / 300 | IntakeRouter, ContactIdentityResolver, ConsentResolver |
| Seller discovery briefing + lead score rationale | 2 | 1,500 / 500 | SellerDiscovery |
| Dossier synthesis + market context | 4 | 3,000 / 800 | PropertyDossier, MarketIntelligence (largest contexts) |
| Comparable reasoning + valuation rationale | 3 | 2,500 / 700 | ComparableSelection, ValuationSupport |
| Strategy + listing copy + variants (feature sheet, social, email) | 6 | 2,000 / 1,200 | ListingStrategist, ContentBrand (highest output volume) |
| Media QA + campaign plan | 2 | 1,500 / 400 | MediaQA, CampaignPlanner |
| Conversation handling (avg 8 exchanges) | 8 | 1,000 / 350 | ConversationalLead, grounded-evidence citations |
| Offer extraction (2 offers × ~15 fields w/ page citations) | 4 | 4,000 / 1,000 | OfferExtraction — long document contexts |
| Transaction coordination kickoff | 2 | 1,500 / 500 | TransactionCoordinator |
| **Total per journey** | **34 calls** | **≈ 60,000 in / 24,000 out** | Deterministic-heuristic cores do most work; LLM only via gateway |

**Per 1,000 seller journeys/month:** ≈ 60M input tokens, 24M output tokens, 34k calls. Buyer-inquiry-only journeys are ≈ 1/4 of this. These volumes reflect the architecture's design choice — deterministic cores + evidence stores (`ARCHITECTURE_CONTRACT.md`), with the model used for synthesis and language, not retrieval.

## 2. Model-gateway cost (live provider, per 1k seller journeys)

Illustrative OpenAI-compatible price points (verify current rates; Canada-hosted options may price differently):

| Provider tier | Assumed price (in / out per 1M tokens) | Cost per 1k journeys | Cost per journey |
|---|---|---|---|
| Budget / small model | $0.15 / $0.60 | ≈ $23 | ≈ $0.02 |
| Mid-tier (Kimi K3-class, assumed) | $0.40 / $1.60 | ≈ $62 | ≈ $0.06 |
| Premium frontier | $2.50 / $10.00 | ≈ $390 | ≈ $0.39 |
| Self-hosted (Canada) | amortized GPU ≈ $400–900/mo flat | flat | flat at volume |

Gateway controls bound this: per-call token and cost caps (`CAPS.maxTokens` / `CAPS.maxCostCentsPerCall` in `api/gateway/`, downward-overridable per request) with deterministic fallback when the primary provider fails; `model_calls` records `tokensIn/tokensOut/costCents` per call, so the actuals above are measurable from day one — reconcile this model against `model_calls` monthly. (No daily aggregate cost cap exists yet — per-call caps only.)

**Sensitivity routing note (PIPEDA-06):** high-sensitivity tasks route only to approved (Canada-hosted/self-hosted) endpoints; if that forces the premium tier for ~20% of calls, add ≈ 15–25% to the mid-tier figure.

## 3. Infrastructure tiers (per tenant, monthly, Canada region)

| Tier | Profile | App + DB | Object storage (offers/media) | Backups/PITR | Observability | Est. infra total |
|---|---|---|---|---|---|---|
| **Solo registrant** | 1 user, ~50 active contacts, ~10 journeys/mo | shared/small instance ≈ $40 | ≈ $2 | ≈ $10 | basic ≈ $5 | **≈ $55–75** |
| **Team** | 5–10 users, ~30 journeys/mo, campaign volume | ≈ $120 | ≈ $10 | ≈ $25 | ≈ $20 | **≈ $175–225** |
| **Brokerage** | 25–100 users, ~150–500 journeys/mo, FINTRAC queue, audit retention | ≈ $450 (dedicated DB) | ≈ $60 | ≈ $90 (24-mo breach register + 5-y FINTRAC retention) | ≈ $80 (OTel, alerting) | **≈ $680–900** |
| **Multi-office / enterprise** | several brokerages-in-one, 1k+ journeys/mo | ≈ $1,500+ (HA, read replicas) | ≈ $200 | ≈ $250 | ≈ $250 | **≈ $2,200–3,000** |

Excluded (buyer's own accounts): email/SMS provider fees, DNCL subscription (registration free since 2022-04-01 but operational process required), REALTOR.ca DDF/board MLS data agreements (see `docs/licensed-data-onboarding.md`), e-signature, and — when deployed — Temporal cluster or pgvector/OpenSearch (full-spec swap, `docs/deployment-guide.md` §4: budget ≈ $300–800/mo additional for a small Temporal + Postgres + pgvector topology in a Canada region).

## 4. Putting it together (illustrative monthly totals)

| Tier | Infra | Model @ mid-tier | Total (mid-tier model) | Total (mock = $0 model) |
|---|---|---|---|---|
| Solo (≈10 journeys/mo) | ≈ $65 | < $1 | **≈ $65** | ≈ $65 |
| Team (≈30 journeys/mo) | ≈ $200 | ≈ $2 | **≈ $200** | ≈ $200 |
| Brokerage (≈300 journeys/mo) | ≈ $790 | ≈ $19 | **≈ $810** | ≈ $790 |
| Enterprise (≈1,000 journeys/mo) | ≈ $2,600 | ≈ $62 (mid) / ≈ $390 (premium) | **≈ $2,660–2,990** | ≈ $2,600 |

## 5. Honest assumptions & caveats

1. **Token volumes are engineering estimates** from the stage table, not measured production data; `model_calls` provides exact actuals — recalibrate after the first live month (target: this table regenerated from real `tokensIn/tokensOut/costCents` aggregates).
2. **Mock provider = $0** and is the default; all demo/eval behaviour runs at zero model cost. Costs begin only when the live provider is configured via `MODEL_GATEWAY_*` (ADR-004).
3. **Provider prices change** and Canada-hosted/self-hosted pricing varies widely; the mid-tier line is an assumption, not a quote.
4. **Retention drives storage cost**: 5-year FINTRAC records, 24-month breach register, indefinite consent ledger (CASL-07), append-only audit chain — storage grows monotonically by design; the tiers include this, and lawful-destruction jobs (`agents/PrivacyRetention`) bound it.
5. **Evals and tests are free-tier friendly**: deterministic provider means CI evals cost nothing beyond compute minutes.
6. **Fail-closed design has a cost benefit**: a provider outage falls back to deterministic behaviour after a single failure (one deterministic fallback, no retry loop) rather than running up retry bills.
