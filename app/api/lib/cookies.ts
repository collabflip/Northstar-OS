import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);

  return {
    httpOnly: true,
    path: "/",
    // Informational (red-team): SameSite=Lax everywhere. The app is not
    // embedded cross-site; the OAuth callback is a top-level navigation GET,
    // which Lax permits. This kills cross-site subresource requests carrying
    // the session (e.g. <img>-triggered GETs).
    sameSite: "Lax",
    secure: !localhost,
  };
}
