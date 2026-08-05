#!/usr/bin/env node
/**
 * Northstar SellerOS — reusable HTTP smoke battery.
 *
 * Runs the deployment-target smoke checks (items 1–7 of the 14-item release
 * battery) against ANY base URL: local preview, staging, or the published
 * deployment. DB-backed items (8–13) are covered by `npm test` /
 * `npm run evals` / `scripts/ci-migrate-proof.mjs` and are not repeatable
 * against a remote target without DB credentials.
 *
 * Usage:
 *   node scripts/smoke.mjs --base https://your-published-url.example
 *   BASE_URL=http://localhost:3000 node scripts/smoke.mjs
 *
 * Exit code 0 = all checks PASS, 1 = at least one FAIL. No npm dependencies
 * (global fetch, Node >= 18; project baseline is Node >= 22.22.0).
 */

const argBase = process.argv.find((a, i) => process.argv[i - 1] === "--base");
const BASE = (argBase || process.env.BASE_URL || process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;

/** @param {string} path @param {RequestInit} [init] */
async function req(path, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, { redirect: "manual", signal: ctrl.signal, ...init });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text };
  } finally {
    clearTimeout(timer);
  }
}

/** @type {{ name: string; run: () => Promise<string> }[]} */
const checks = [
  {
    name: "GET / serves the app shell",
    run: async () => {
      const r = await req("/");
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (!/<div id="root">|<title>/i.test(r.text)) throw new Error("no app-shell marker in HTML");
      return "200 + app shell";
    },
  },
  {
    name: "GET /api/trpc/ping",
    run: async () => {
      const r = await req("/api/trpc/ping");
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      const body = JSON.parse(r.text);
      if (body?.result?.data?.json?.ok !== true) throw new Error("ok !== true");
      return "200 ok:true";
    },
  },
  {
    name: "GET /api/livez",
    run: async () => {
      const r = await req("/api/livez");
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (JSON.parse(r.text)?.status !== "ok") throw new Error("status !== ok");
      return '200 {"status":"ok"}';
    },
  },
  {
    name: "GET /api/readyz (live DB SELECT 1)",
    run: async () => {
      const r = await req("/api/readyz");
      if (r.status !== 200) throw new Error(`status ${r.status}`);
      if (JSON.parse(r.text)?.status !== "ready") throw new Error("status !== ready");
      return '200 {"status":"ready"} — DB reachable from server';
    },
  },
  {
    name: "unauthenticated approvals.list is rejected",
    run: async () => {
      const r = await req("/api/trpc/approvals.list");
      if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
      if (!/UNAUTHORIZED|Authentication required/i.test(r.text)) throw new Error("no UNAUTHORIZED body");
      return "401 UNAUTHORIZED";
    },
  },
  {
    name: "unknown route returns 404",
    run: async () => {
      const r = await req("/api/__smoke-no-such-route-7f3a9");
      if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
      return "404";
    },
  },
  {
    name: "GET /api/oauth/login redirects to Kimi authorize",
    run: async () => {
      const r = await req("/api/oauth/login");
      if (r.status !== 302) throw new Error(`expected 302, got ${r.status}`);
      const loc = r.headers.get("location") || "";
      if (!/oauth\/authorize/.test(loc)) throw new Error(`bad location: ${loc.slice(0, 80)}`);
      if (!/client_id=/.test(loc)) throw new Error("no client_id in redirect");
      return "302 → oauth/authorize?client_id=…";
    },
  },
];

let pass = 0;
console.log(`Northstar SellerOS smoke battery — target: ${BASE}\n`);
for (const c of checks) {
  try {
    const detail = await c.run();
    pass += 1;
    console.log(`PASS  ${c.name} — ${detail}`);
  } catch (err) {
    console.log(`FAIL  ${c.name} — ${err?.message ?? err}`);
  }
}
console.log(`\n${pass}/${checks.length} PASS`);
process.exit(pass === checks.length ? 0 : 1);
