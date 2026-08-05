# Northstar SellerOS — Swarm Execution Plan

**Source of truth:** `/mnt/agents/upload/Northstar SellerOS Build Specification.pdf`
**Governing principle (from spec §15):** Prefer a smaller, genuinely functioning vertical slice over broad fake functionality. Never pretend a mocked integration is live. Fail closed. Document every assumption.

---

## Reality Calibration (honest, up front)

The spec describes a multi-quarter, multi-team SaaS (20 agents, Temporal, LangGraph, Terraform, 100+ golden scenarios, 4 provincial packs). One swarm session cannot honestly deliver all of that "120%". What CAN be delivered at 120% quality:

- **Wave B vertical slice, fully working:** Ontario residential seller journey — lead capture → consent → appointment → grounded property dossier → valuation support → listing strategy → human approval → campaign draft → audit trail. This is the spec's own priority.
- **Wave C hardening, honestly scoped:** durable/idempotent workflow runner (restart-resume without duplicate actions), bilingual EN/fr-CA UX, commit-time policy enforcement, offer extraction with page-cited comparison, transaction coordination, evaluation harness with golden scenarios + red-team suite.
- **Wave D independent review:** separate reviewer agents, top-10 weaknesses, fixes, re-run, residual-risk report.
- Everything else (REALTOR.ca DDF, Temporal, pgvector, Terraform, BC/AB/QC packs) ships as **production-shaped interfaces, contract tests, and truthful "not connected" status** — exactly as spec §15 demands.

## Architecture Decision (ADR-001, justified per spec §7 "unless rigorous research supports a better alternative")

Spec suggests Next.js + FastAPI + Temporal + Postgres. The delivery platform mandates its proven full-stack composition, so:

- **Frontend:** React + Vite + TypeScript + Tailwind + shadcn/ui (`webapp-building-swarm`)
- **Backend:** Hono + tRPC + Drizzle ORM + MySQL (`backend-building-swarm`) — real API, real DB, real persistence
- **Durable execution:** idempotent workflow runner with outbox pattern + resume semantics (Temporal-shaped interface, honest local implementation) — Temporal swap documented as deployment step
- **Agent runtime:** typed agent framework in backend; all 20 agents return the spec §8 contract (typed result, confidence, evidence IDs, assumptions, conflicts, proposed action, risk, autonomy level, human approval). Deterministic/heuristic cores + model-gateway LLM interface with **deterministic mock provider default** (OpenAI-compatible endpoint configurable). No hidden chain-of-thought stored — only rationale, assumptions, confidence, evidence refs, policy decisions.
- **Policy kernel:** versioned rule packs (Ontario production pack; BC/AB/QC interface + fixtures), fail-closed commit-time gate validating every §5 field.

---

## Stage 0 — Contract & Setup (Orchestrator, no sub-agents)
- Write `ARCHITECTURE_CONTRACT.md` (one domain model, one backlog — spec §2), `ASSUMPTIONS.md`, backlog.
- Load `swarm-workspace`; create shared repo + worktree script.

## Stage 1 — Wave A: Foundation (parallel, read-only)
Load: none (Orchestrator-designed briefs).
- **A1 Compliance researcher** (explore): CASL, DNCL, PIPEDA, FINTRAC real-estate duties, RECO/OREA Ontario rules, human-rights guardrails → `compliance/control-matrix.md` + Ontario policy-pack rule data (each rule: source, jurisdiction, effective/review dates, owner, version, control, tests, escalation).
- **A2 Domain architect** (plan): domain schema (tenant, user, role, contact, consent, property, dossier, evidence, valuation, strategy, approval, campaign, offer, transaction, workflow, audit, policy), event catalog, agent contract, API surface.
- **A3 UX director** (plan): design system direction (premium, calm, accessible, low-saturation; evidence-type visual language per spec §12), screen inventory (15 screens), bilingual string strategy.
- **Gate:** contracts reviewed by Orchestrator; conflicts resolved before any builder starts.

## Stage 2 — Wave B: Vertical Slice Build (parallel builders on worktrees)
Load: `vibecoding-webapp-swarm` (orchestration + product-knowledge), `webapp-building-swarm`, `backend-building-swarm`, `swarm-workspace`.
- **B1 Backend builder** (coder): schema + migrations, seed data, tRPC routers (contacts/consents/properties/dossiers/valuations/strategies/approvals/campaigns/offers/transactions/audit/policy), policy engine v1, workflow runner, agent framework + Ontario seller-journey agents, mock providers (comms, listing data) with truthful status.
- **B2 Frontend builder** (coder, after B1 contract lands): command centre, seller pipeline, seller 360, property dossier w/ evidence-uncertainty UX, approval inbox (payload-bound approval), listing launch board, conversation console, offer room, transaction timeline, compliance dashboard, audit explorer, settings, seller portal.
- **B3 Integration**: merge, wire end-to-end, seed demo, `README` one-command start.
- **Gate:** seller-to-approval journey runs end-to-end locally; tests green.

## Stage 3 — Wave C: Hardening (parallel)
- **C1 Policy & agents** (coder): full commit-time gate (all §5 checks), CASL/DNCL/FINTRAC/privacy controls, remaining agents to contract, offer extraction w/ page citations, transaction coordination, idempotency + restart-resume proof.
- **C2 Bilingual + UX polish** (coder): fr-CA string catalog, parity checks, evidence-type visual language, accessibility pass.
- **C3 Eval harness** (coder): golden scenario suite (target 100; honest count reported), seller-conversation simulator, red-team cases (prompt injection, exfiltration, cross-tenant, stale approvals, duplicate webhooks, outage recovery), metrics report.
- **Gate:** full test suite + evals green; eval report generated.

## Stage 4 — Wave D: Independent Review (parallel reviewers, then fixes)
- **D1 Architecture reviewer**, **D2 Security/privacy reviewer**, **D3 Compliance reviewer**, **D4 QA/ops reviewer** (reviewer/verifier agents): each returns ranked findings.
- Orchestrator merges → top-10 by impact/exploitability → **fix sub-agents** → re-run everything.

## Stage 5 — Package & Deliver
- Docs: ADRs, data-flow + agent-flow diagrams, threat model, compliance matrix, deployment guide, ops/incident runbooks, cost model, build-vs-buy, licensed-data onboarding checklist, legal-review checklist, demo script, 30/60/90 roadmap, **honest residual-risk report**, eval report.
- Run full suite + security scan, fix, re-run.
- `mshtools-website_version_manager` build_version → preview card.
- Final response: what works (tested), what's mocked (truthful status), exact next steps for licensed data + Canadian production launch.

## Deliverable map (spec §14) — all 29 items produced; those beyond honest scope ship as interfaces/contracts/checklists with truthful status, never faked.

---

## Stage 7 — Final Red Team Swarm (user mandate 2026-08-03)
Wave 1 (parallel verifiers, evidence-only findings): security+tenancy (redteam-sec), compliance+agents (redteam-compliance), architecture+database (redteam-arch), QA+proof (redteam-qa) → reports to /mnt/agents/output/redteam/
Wave 2: consolidate confirmed criticals → fix agents (commit-per-fix, gates must stay green)
Wave 3: 12 output docs incl. 12_FINAL_SCORE.md verdict, gate outputs, git diff vs 679f2f6, untested/mocked list, clean ZIP export. No mock-is-live claims.
