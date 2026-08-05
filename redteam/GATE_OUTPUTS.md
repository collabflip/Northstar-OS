# Exact Gate Outputs — final head 66c5d2b (2026-08-03)

All commands run by the lead on the merged integration tree (Node 20, worktree with live `.env`). Reproduced verbatim from terminal output.

## npm run check (tsc -b)
```
(exit 0, no output)
```

## npm run lint
```
✖ 5 problems (0 errors, 5 warnings)
```
The 5 warnings are the documented react-hooks/exhaustive-deps set in src/pages (Approvals, OfferRoom, PropertyDossier) — e.g.:
```
154:9  warning  The 'propertyEvidence' logical expression could make the dependencies of useMemo Hook (at line 164) change on every render. ... react-hooks/exhaustive-deps
158:9  warning  The 'dossierEvidence' logical expression could make the dependencies of useMemo Hook (at line 164) change on every render. ... react-hooks/exhaustive-deps
```

## npm run test (vitest)
```
 Test Files  35 passed (35)
      Tests  248 passed (248)
```
Note: one prior parallel run showed 247/248 — the documented DB-7 live-DB concurrency-probe flake (ER_DUP_ENTRY under parallel workers). Two subsequent full runs: 248/248. Fails loudly, never silently.

## npm run evals
```
23 category lines, all ✓ — including:
  ✓ cross_tenant_leakage ...
  ✓ stale_approvals ...
  ✓ duplicate_webhooks ...
  ✓ seller_conversation_simulator    85/85
report written to evals/report.md (0.1s)
```
Golden scenarios: 131/131 across the 23 spec §13 categories. The committed `evals/report.md` is byte-identical to a fresh run except the timestamp (independently verified by the QA red-teamer).

## npm run build
```
dist/public/index.html                   0.79 kB │ gzip:   0.43 kB
dist/public/assets/index-CJUcrLxj.css  104.99 kB │ gzip:  17.86 kB
dist/public/assets/index-BNeUmhzO.js 1,240.62 kB │ gzip: 328.83 kB
✓ built in 14.46s
  dist/boot.js  2.5mb ⚠️  (esbuild, chunk-size warning known)
```

## npx tsx db/seed.ts (×2, idempotency)
```
[seed] DONE ✔ {"contacts":7,"consents":10,"properties":4,"comparables":7,"approvals":2,"offers":2,"workflows":2,"outboxSent":2,"sellerDirectionArtifacts":1,"jonahSmsDecision":2162257,"policyRules":47}
[seed] DONE ✔ {"contacts":7,...,"jonahSmsDecision":2162260,"policyRules":47}
```
Identical entity counts both runs (wipe+reseed); new decision ids prove the gate actually re-evaluated and persisted a fresh blocked CASL-03 decision each run.

## Live server smoke (QA verifier, independent)
```
dist boot ok · GET / → 200 · /api/ping → 200
dashboard.summary + contacts.list unauthenticated → 401
/api/nope → 404 · /api/oauth/login → 302 auth.kimi.com · callback no-params → 400
```
