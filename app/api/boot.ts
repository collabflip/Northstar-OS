import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler, createOAuthLoginHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { getStore } from "./store/drizzle";
import { getDb, closeDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import type { Store } from "./store/types";
import { drainOutbox, type DrainResult } from "./workflows/drainer";
import { MockCommsProvider } from "./integrations/mockComms";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthLogin, createOAuthLoginHandler());
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
// Liveness: process is up — no dependency checks, must never fail.
app.get("/api/livez", (c) => c.json({ status: "ok" }));
// Readiness: verifies the DB pool can serve a query (SELECT 1).
app.get("/api/readyz", async (c) => {
  try {
    await getDb().execute(sql`SELECT 1`);
    return c.json({ status: "ready" }, 200);
  } catch (err) {
    console.error("[readyz] DB check failed", err);
    return c.json({ status: "not_ready" }, 503);
  }
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

// ── outbox drainer interval worker (ARCH-7 / GAP-7) ─────────────────────────
// The drainer is the ONLY path from queued intent to external side effect;
// without a scheduler, queued rows only moved on a manual "simulate restart"
// click. DRAINER_INTERVAL_MS (default 30000; 0 disables) drains pending
// outbox rows per tenant, in-process, in both the dev and production servers.

const DEFAULT_DRAINER_INTERVAL_MS = 30_000;

export function drainerIntervalMs(
  envValue: string | undefined = process.env.DRAINER_INTERVAL_MS,
): number {
  if (envValue === undefined) return DEFAULT_DRAINER_INTERVAL_MS;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DRAINER_INTERVAL_MS;
}

export interface DrainerWorkerDeps {
  store: Store;
  comms: MockCommsProvider;
  now?: () => Date;
}

export interface DrainerWorkerHandle {
  stop: () => void;
}

/** One drain cycle: pending outbox rows, drained per tenant. */
export async function runDrainerCycle(deps: DrainerWorkerDeps): Promise<DrainResult[]> {
  const now = deps.now?.() ?? new Date();
  const tenantIds = [
    ...new Set((await deps.store.listPendingOutbox()).map((r) => r.tenantId)),
  ];
  const results: DrainResult[] = [];
  for (const tenantId of tenantIds) {
    results.push(await drainOutbox(deps.store, deps.comms, { now, tenantId }));
  }
  return results;
}

/**
 * Start the interval worker. Returns null when disabled (interval ≤ 0).
 * Per-row failures are contained by the drainer's per-row guard; a cycle
 * failure is logged and retried on the next tick — no unhandled rejections.
 */
export function startDrainerWorker(
  deps: DrainerWorkerDeps,
  intervalMs: number = drainerIntervalMs(),
): DrainerWorkerHandle | null {
  if (intervalMs <= 0) return null; // DRAINER_INTERVAL_MS=0 disables
  const timer = setInterval(() => {
    void runDrainerCycle(deps)
      .then((results) => {
        const processed = results.reduce((n, r) => n + r.processed, 0);
        console.debug(
          `[drainer] cycle: ${processed} pending row(s) across ${results.length} tenant(s)`,
        );
      })
      .catch((err) => console.error("[drainer] cycle failed — retried next interval", err));
  }, intervalMs);
  timer.unref?.(); // never keep the process alive for the worker alone
  return { stop: () => clearInterval(timer) };
}

// Start the worker for real servers (dev + production). Under NODE_ENV=test
// the module is imported by tests — never start intervals there.
const drainerWorker =
  process.env.NODE_ENV === "test"
    ? null
    : startDrainerWorker({ store: getStore(), comms: new MockCommsProvider() });

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
  // Stop the drainer worker (clearInterval) when the server closes.
  server.on("close", () => drainerWorker?.stop());

  // Graceful shutdown: stop accepting new connections, drain in-flight
  // requests, stop the drainer, end the DB pool, then exit 0.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[boot] ${signal} received — graceful shutdown started`);
    // Safety net: never hang forever on a stuck connection.
    const forceTimer = setTimeout(() => {
      console.error("[boot] graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000);
    forceTimer.unref();
    drainerWorker?.stop();
    server.close(() => {
      void closeDb()
        .catch((err) => console.error("[boot] error closing DB pool", err))
        .finally(() => {
          clearTimeout(forceTimer);
          console.log("[boot] shutdown complete");
          process.exit(0);
        });
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
