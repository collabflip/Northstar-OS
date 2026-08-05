/**
 * RED-TEAM: JWT/session forgery battery (offline crypto, no DB except where
 * marked). Exercises verifySessionToken / authenticateRequest against the
 * classic HS256 attack classes.
 */
import { describe, expect, it } from "vitest";
import * as jose from "jose";
import { signSessionToken, verifySessionToken } from "../kimi/session";
import { env } from "../lib/env";

const secret = new TextEncoder().encode(env.appSecret);
const WRONG = new TextEncoder().encode("wrong-secret-not-the-app-secret");

function b64(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

describe("JWT forgery attempts (must ALL fail)", () => {
  it("token signed with the WRONG secret → rejected", async () => {
    const forged = await new jose.SignJWT({ unionId: "u1", clientId: env.appId })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(WRONG);
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("alg=none token → rejected", async () => {
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ unionId: "u1", clientId: env.appId })}.`;
    expect(await verifySessionToken(none)).toBeNull();
  });

  it("algorithm confusion: HS256 header but garbage signature → rejected", async () => {
    const tok = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ unionId: "u1", clientId: env.appId })}.${Buffer.from("forged").toString("base64url")}`;
    expect(await verifySessionToken(tok)).toBeNull();
  });

  it("RS256-signed token (asymmetric confusion) → rejected (alg pinned HS256)", async () => {
    const { privateKey } = await jose.generateKeyPair("RS256");
    const forged = await new jose.SignJWT({ unionId: "u1", clientId: env.appId })
      .setProtectedHeader({ alg: "RS256" })
      .setExpirationTime("1h")
      .sign(privateKey);
    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("EXPIRED token (correct secret) → rejected", async () => {
    const expired = await new jose.SignJWT({ unionId: "u1", clientId: env.appId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);
    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("token missing unionId/clientId → rejected", async () => {
    const noUnion = await new jose.SignJWT({ clientId: env.appId })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(secret);
    expect(await verifySessionToken(noUnion)).toBeNull();
    const noClient = await new jose.SignJWT({ unionId: "u1" })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(secret);
    expect(await verifySessionToken(noClient)).toBeNull();
  });

  it("empty/garbage token → rejected", async () => {
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
  });
});

describe("regression: SEC-9 session token policy hardened", () => {
  it("clientId claim IS validated against env.appId — foreign client rejected", async () => {
    const evilClient = await new jose.SignJWT({ unionId: "u1", clientId: "attacker-controlled-client" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifySessionToken(evilClient)).toBeNull(); // rejected
    // …while a token for THIS app is still accepted:
    const ours = await new jose.SignJWT({ unionId: "u1", clientId: env.appId })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);
    expect(await verifySessionToken(ours)).toMatchObject({ unionId: "u1", clientId: env.appId });
  });

  it("session tokens live AT MOST 7 days (was ~1 year)", async () => {
    const tok = await signSessionToken({ unionId: "u1", clientId: env.appId });
    const { payload } = await jose.jwtVerify(tok, secret, { algorithms: ["HS256"] });
    const lifetimeS = (payload.exp ?? 0) - (payload.iat ?? 0);
    expect(lifetimeS).toBeLessThanOrEqual(7 * 24 * 3600);
    expect(lifetimeS).toBeGreaterThan(0);
    // ROADMAP (documented, not built): jti + server-side revocation list for
    // instant logout of stolen tokens.
  });
});
