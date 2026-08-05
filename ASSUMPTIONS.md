# ASSUMPTIONS.md — Northstar SellerOS

Material assumptions made during this build (spec §2: "Record all material assumptions").

1. **Stack substitution (ADR-001).** Spec §7 permits a better-supported alternative. The delivery platform provides React+Vite+Hono+tRPC+Drizzle+MySQL; Temporal/LangGraph/Postgres are represented by honest, interface-compatible local implementations. Swaps documented in `docs/deployment.md`.
2. **Tenant isolation is application-enforced.** MySQL lacks PostgreSQL RLS; isolation is enforced in the repository layer and verified by cross-tenant leakage tests. Production deployment guide recommends DB-level enforcement as a hardening step.
3. **Demo tenancy.** A seeded tenant "Northstar Demo Brokerage" (Ontario) with seeded users/roles, contacts, properties, offers, and a transaction demonstrates all journeys. OAuth first-login joins this tenant with a selectable demo role — labeled demo impersonation, not production identity.
4. **All external integrations are mocks or interfaces.** No REALTOR.ca DDF/MLS credentials, email/SMS provider, or calendar API exist in this environment. Adapters are production-shaped with contract tests and `status: mock / not_connected`, never displayed as live (spec §15).
5. **Model gateway defaults to a deterministic mock provider.** An OpenAI-compatible endpoint (Kimi K3 or Canada-hosted) is configurable via env. All AI behavior in the demo is deterministic and reproducible; `modelVersion: "mock-deterministic-1"` is recorded honestly.
6. **Ontario policy pack is engineering-grade, not legal advice.** Rules derive from public sources (CASL, CRTC rules, PIPEDA, PCMLTFA/FINTRAC guidance, TRESA/RECO). Software does not guarantee legal compliance; `docs/legal-review-checklist.md` routes every pack to brokerage counsel. BC/AB/QC packs are schema-valid fixtures, explicitly non-production.
7. **Scope honesty (spec §15: "smaller, genuinely functioning vertical slice").** The Ontario seller journey + offer room + transaction coordination + compliance kernel + evals are fully functional. Breadth items (all 4 provincial packs in production, pgvector retrieval, Terraform, 100% of spec §9 sync features) ship as interfaces/fixtures/roadmap with truthful status.
8. **Golden scenarios** are programmatically generated per category with deterministic expectations; the count and pass rates are reported exactly in `evals/report.md`.
9. **No real PII.** All seed data is fictional. Any resemblance to real persons is coincidental.
10. **Bilingual scope.** UI strings ship EN + fr-CA with parity tests; seeded long-form content is EN-primary with fr-CA UI chrome (noted in residual-risk report).
11. **MFA** is "MFA-ready" via the platform OAuth layer; native TOTP is roadmap (honest note in security docs).
12. **Time zone**: all policy time windows (calling hours, unsubscribe SLAs) evaluated in America/Toronto unless tenant overrides.
