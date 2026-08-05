import { describe, expect, it } from "vitest";
import app from "./boot";

// Liveness/readiness smoke tests. The Hono app is exported from boot.ts, so we
// exercise the routes in-process via app.request (no listener needed).
describe("livez / readyz", () => {
  it("GET /api/livez always returns 200 {status:'ok'}", async () => {
    const res = await app.request("http://test/api/livez");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /api/readyz returns 200 {status:'ready'} when the DB pool answers SELECT 1", async () => {
    const res = await app.request("http://test/api/readyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("existing tRPC ping is untouched", async () => {
    const res = await app.request("http://test/api/trpc/ping");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { data: { json: { ok: boolean } } } };
    expect(body.result.data.json.ok).toBe(true);
  });

  it("unknown /api routes still 404", async () => {
    const res = await app.request("http://test/api/definitely-not-a-route");
    expect(res.status).toBe(404);
  });
});
