import * as jose from "jose";
import { env } from "../lib/env";
import type { SessionPayload } from "./types";

const JWT_ALG = "HS256";
/**
 * SEC-9: session lifetime capped at 7 days (was ~1 year). A session simply
 * expires — the user signs in again via Kimi OAuth. Server-side token
 * revocation (jti + revocation list for instant logout) is ROADMAP, not
 * implemented: logout clears the cookie but a stolen unexpired token remains
 * valid until expiry. The 7-day cap bounds that exposure window.
 */
const SESSION_TTL = "7d";

export async function signSessionToken(
  payload: SessionPayload,
): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  if (!token) {
    console.warn("[session] No token provided for verification.");
    return null;
  }
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
    });
    const { unionId, clientId } = payload;
    if (!unionId || !clientId) {
      console.warn("[session] JWT payload missing required fields.");
      return null;
    }
    // SEC-9: the audience/client claim must be THIS app — a token minted for
    // (or forged with) any other clientId is not a session here.
    if (clientId !== env.appId) {
      console.warn("[session] JWT clientId does not match this app — rejected.");
      return null;
    }
    return { unionId, clientId } as SessionPayload;
  } catch (error) {
    console.warn("[session] JWT verification failed:", error);
    return null;
  }
}
