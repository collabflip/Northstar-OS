import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import * as jose from "jose";
import * as cookie from "cookie";
import { nanoid } from "nanoid";
import { env } from "../lib/env";
import { getSessionCookieOptions } from "../lib/cookies";
import { Paths, Session } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import { signSessionToken, verifySessionToken } from "./session";
import { users as kimiUsers } from "./platform";
import {
  findUserByUnionId,
  provisionFirstLoginDemoMembership,
  upsertUser,
} from "../queries/users";
import type { TokenResponse } from "./types";

async function exchangeAuthCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.appId,
    redirect_uri: redirectUri,
    client_secret: env.appSecret,
  });

  const resp = await fetch(`${env.kimiAuthUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<TokenResponse>;
}

const jwks = jose.createRemoteJWKSet(
  new URL(`${env.kimiAuthUrl}/api/.well-known/jwks.json`),
);

async function verifyAccessToken(
  accessToken: string,
): Promise<{ userId: string; clientId: string }> {
  const { payload } = await jose.jwtVerify(accessToken, jwks);
  const userId = payload.user_id as string;
  const clientId = payload.client_id as string;
  if (!userId) {
    throw new Error("user_id missing from access token");
  }
  return { userId, clientId };
}

export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    console.warn("[auth] No session cookie found in request.");
    throw Errors.forbidden("Invalid authentication token.");
  }
  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const user = await findUserByUnionId(claim.unionId);
  if (!user) {
    throw Errors.forbidden("User not found. Please re-login.");
  }
  return user;
}

// ─── F4: OAuth state CSRF protection ────────────────────────────────────────

export const OAUTH_STATE_COOKIE = "kimi_oauth_state";
export const OAUTH_STATE_MAX_AGE_S = 600;

/** The OAuth state cookie is CSRF-sensitive: httpOnly + SameSite=Lax always. */
function oauthStateCookieOptions(origin: string) {
  const host = new URL(origin).hostname;
  const localhost = host === "localhost" || host === "127.0.0.1";
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: !localhost,
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_S,
  };
}

/** Redirect URI is derived from the server-observed origin — never caller input. */
export function oauthRedirectUriFor(origin: string): string {
  return `${origin}${Paths.oauthCallback}`;
}

/**
 * Login initiation: generates a cryptographic nonce, binds it to an httpOnly
 * SameSite=Lax cookie, and uses it as the OAuth `state`. Any caller-supplied
 * redirect_uri is ignored (no open redirect).
 */
export function createOAuthLoginHandler() {
  return async (c: Context) => {
    const origin = new URL(c.req.url).origin;
    const nonce = nanoid();
    setCookie(c, OAUTH_STATE_COOKIE, nonce, oauthStateCookieOptions(origin));

    const url = new URL(`${env.kimiAuthUrl}/api/oauth/authorize`);
    url.searchParams.set("client_id", env.appId);
    url.searchParams.set("redirect_uri", oauthRedirectUriFor(origin));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "profile");
    url.searchParams.set("state", nonce);
    return c.redirect(url.toString(), 302);
  };
}

export interface OAuthCallbackDeps {
  exchange: typeof exchangeAuthCode;
  verify: typeof verifyAccessToken;
  getProfile: (token: string) => Promise<{ name?: string; avatar_url?: string } | null>;
}

export function createOAuthCallbackHandler(deps: Partial<OAuthCallbackDeps> = {}) {
  const exchange = deps.exchange ?? exchangeAuthCode;
  const verify = deps.verify ?? verifyAccessToken;
  const getProfile = deps.getProfile ?? ((token: string) => kimiUsers.getProfile(token));
  return async (c: Context) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");

    if (error) {
      if (error === "access_denied") {
        return c.redirect("/", 302);
      }
      return c.json(
        { error, error_description: errorDescription },
        400,
      );
    }

    if (!code || !state) {
      return c.json({ error: "code and state are required" }, 400);
    }

    // F4: state must equal the nonce in the httpOnly cookie set at login —
    // a forged/missing/mismatched state is rejected before any token exchange.
    const cookies = cookie.parse(c.req.raw.headers.get("cookie") || "");
    const expectedState = cookies[OAUTH_STATE_COOKIE];
    if (!expectedState || expectedState !== state) {
      return c.json({ error: "invalid oauth state" }, 400);
    }

    try {
      const origin = new URL(c.req.url).origin;
      const redirectUri = oauthRedirectUriFor(origin);
      const tokenResp = await exchange(code, redirectUri);
      const { userId } = await verify(tokenResp.access_token);
      const userProfile = await getProfile(tokenResp.access_token);
      if (!userProfile) {
        throw new Error("Failed to fetch user profile from Kimi Open");
      }

      await upsertUser({
        unionId: userId,
        name: userProfile.name,
        avatar: userProfile.avatar_url,
        lastSignInAt: new Date(),
      });

      // F2: first login must provision demo-brokerage membership so the new
      // user is not left tenantless. No-op on subsequent logins.
      const dbUser = await findUserByUnionId(userId);
      if (dbUser) {
        await provisionFirstLoginDemoMembership(dbUser.id);
      }

      const token = await signSessionToken({
        unionId: userId,
        clientId: env.appId,
      });

      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });
      // One-time state nonce: clear after a successful exchange.
      setCookie(c, OAUTH_STATE_COOKIE, "", {
        ...oauthStateCookieOptions(origin),
        maxAge: 0,
      });

      return c.redirect("/", 302);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      return c.json({ error: "OAuth callback failed" }, 500);
    }
  };
}

export { exchangeAuthCode, verifyAccessToken };
