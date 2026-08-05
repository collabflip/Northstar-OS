/**
 * F4 — OAuth state CSRF. State is a server-generated nonce bound to an
 * httpOnly SameSite=Lax cookie; the callback rejects forged/missing state.
 */
import { afterAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import {
  createOAuthCallbackHandler,
  createOAuthLoginHandler,
  OAUTH_STATE_COOKIE,
  type OAuthCallbackDeps,
} from "./auth";

const F4_UNION_ID = `test-f4-${Date.now()}`;

function makeApp() {
  const app = new Hono();
  const deps: OAuthCallbackDeps = {
    exchange: async () => ({ access_token: "fake-access-token" }) as never,
    verify: async () => ({ userId: F4_UNION_ID, clientId: "test" }),
    getProfile: async () => ({ name: "F4 Test User", avatar_url: undefined }),
  };
  app.get("/api/oauth/login", createOAuthLoginHandler());
  app.get("/api/oauth/callback", createOAuthCallbackHandler(deps));
  return app;
}

afterAll(async () => {
  const db = getDb();
  const users = await db.select().from(s.users).where(eq(s.users.unionId, F4_UNION_ID));
  for (const u of users) {
    await db.delete(s.memberships).where(eq(s.memberships.userId, u.id));
    await db.delete(s.users).where(eq(s.users.id, u.id));
  }
});

describe("F4 OAuth state CSRF", () => {
  it("rejects callback when the state cookie is missing", async () => {
    const res = await makeApp().request(
      "http://localhost/api/oauth/callback?code=abc&state=whatever",
    );
    expect(res.status).toBe(400);
  });

  it("rejects a forged/mismatched state param", async () => {
    const res = await makeApp().request(
      "http://localhost/api/oauth/callback?code=abc&state=forged-state",
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=real-nonce` } },
    );
    expect(res.status).toBe(400);
  });

  it("rejects callback when the state param is missing", async () => {
    const res = await makeApp().request(
      "http://localhost/api/oauth/callback?code=abc",
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=real-nonce` } },
    );
    expect(res.status).toBe(400);
  });

  it("rejects callback when the code param is missing", async () => {
    const res = await makeApp().request(
      "http://localhost/api/oauth/callback?state=real-nonce",
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=real-nonce` } },
    );
    expect(res.status).toBe(400);
  });

  it("accepts a valid state round-trip and issues a session", async () => {
    const res = await makeApp().request(
      "http://localhost/api/oauth/callback?code=abc&state=good-nonce",
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=good-nonce` } },
    );
    expect(res.status).toBe(302);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("kimi_sid="))).toBe(true);
    // One-time state nonce is cleared.
    expect(setCookies.some((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=;`) || c.includes(`${OAUTH_STATE_COOKIE}=;`))).toBe(true);
  });

  it("login issues a nonce state bound to an httpOnly cookie", async () => {
    const res = await makeApp().request("http://localhost/api/oauth/login");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    const state = location.searchParams.get("state");
    expect(state).toBeTruthy();
    const setCookies = res.headers.getSetCookie();
    const stateCookie = setCookies.find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain(state);
  });

  it("login state cookie has CSRF-hardening attributes", async () => {
    const res = await makeApp().request("http://localhost/api/oauth/login");
    const stateCookie = res.headers.getSetCookie().find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`))!;
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("SameSite=Lax");
    expect(stateCookie).toContain("Path=/");
  });

  it("login derives redirect_uri from the server origin (no open redirect)", async () => {
    const res = await makeApp().request(
      "http://localhost/api/oauth/login?redirect_uri=https://evil.example/cb",
    );
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost/api/oauth/callback");
  });

  it("login states are unique cryptographic nonces, not btoa(redirectUri)", async () => {
    const app = makeApp();
    const r1 = await app.request("http://localhost/api/oauth/login");
    const r2 = await app.request("http://localhost/api/oauth/login");
    const s1 = new URL(r1.headers.get("location")!).searchParams.get("state")!;
    const s2 = new URL(r2.headers.get("location")!).searchParams.get("state")!;
    expect(s1).not.toBe(s2);
    expect(s1).not.toBe(btoa("http://localhost/api/oauth/callback"));
    expect(s1.length).toBeGreaterThanOrEqual(16);
  });
});
