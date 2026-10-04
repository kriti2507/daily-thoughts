import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Stateless OAuth for the MCP server, ported from small_wins. Nothing is
// stored: client ids, pending logins, codes and tokens are all payloads signed
// with a key derived from ADMIN_SECRET, so rotating that secret signs out every
// connected app as well as every browser.

export const SCOPE = "daily-thoughts";
export const PENDING_TTL = 10 * 60;
export const CODE_TTL = 5 * 60;
export const ACCESS_TTL = 60 * 60;
export const REFRESH_TTL = 30 * 24 * 60 * 60;

export type Kind = "client" | "pending" | "code" | "access" | "refresh";

function signingKey(): Buffer | null {
  const secret = process.env.ADMIN_SECRET;
  return secret ? createHmac("sha256", secret).update("mcp-oauth").digest() : null;
}

function mac(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

/** Null with ADMIN_SECRET unset: like the admin cookie, MCP is then off. */
export function sign(kind: Kind, payload: object, now = Date.now()): string | null {
  const key = signingKey();
  if (!key) {
    return null;
  }
  const body = Buffer.from(JSON.stringify({ ...payload, k: kind, iat: Math.floor(now / 1000) }))
    .toString("base64url");
  return `${body}.${mac(key, body)}`;
}

/**
 * The payload, or null if tampered, the wrong kind, or older than `ttl`
 * seconds. `kind` keeps one kind of value from being used as another, e.g. a
 * refresh token as an access token.
 */
export function verify<T extends object>(
  kind: Kind,
  value: string | null | undefined,
  ttl?: number,
  now = Date.now(),
): (T & { iat: number }) | null {
  const key = signingKey();
  if (!key || !value) {
    return null;
  }
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) {
    return null;
  }
  const expected = Buffer.from(mac(key, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  let payload: T & { k?: string; iat?: number };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.k !== kind || typeof payload.iat !== "number") {
    return null;
  }
  if (ttl !== undefined && Math.floor(now / 1000) - payload.iat > ttl) {
    return null;
  }
  return payload as T & { iat: number };
}

// --- clients ---------------------------------------------------------------

export interface Client {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method: string;
}

export function clientSecretFor(clientId: string): string {
  return mac(signingKey()!, `client-secret:${clientId}`);
}

export function loadClient(clientId: string | null | undefined): Client | null {
  return verify<Client>("client", clientId);
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Schemes a browser would run or load instead of handing to an app, and "app"
// schemes that just open a web address in a browser.
const BLOCKED_SCHEMES = new Set([
  "javascript", "data", "file", "vbscript", "about", "blob", "ftp", "ws", "wss",
  "intent", "x-safari-http", "x-safari-https", "microsoft-edge", "googlechrome", "googlechromes",
]);

/**
 * https anywhere; http only back to this machine; or a desktop app's own
 * scheme (e.g. cursor://). The consent page shows the destination either way.
 */
export function redirectUriAllowed(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (scheme === "https") {
    return url.hostname !== "";
  }
  if (scheme === "http") {
    return LOOPBACK_HOSTS.has(url.hostname);
  }
  return !BLOCKED_SCHEMES.has(scheme);
}

/** What to show as "you'll be sent to": the web host, or the whole URI for an app scheme. */
export function destination(redirectUri: string): string {
  const url = new URL(redirectUri);
  return url.protocol === "https:" || url.protocol === "http:" ? url.hostname : redirectUri;
}

// --- PKCE ------------------------------------------------------------------

export function pkceMatches(verifier: string, challenge: string): boolean {
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const given = Buffer.from(challenge);
  return computed.length === given.length && timingSafeEqual(computed, given);
}

// --- HTTP helpers ----------------------------------------------------------

// Browser-based clients (e.g. the MCP Inspector) call the metadata, register,
// token and MCP endpoints cross-origin. Every one of them needs a token or
// signed value anyway, so any origin may ask.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "no-store", ...headers },
  });
}

export function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** The public origin, taken from the request so previews and localhost just work. */
export function origin(request: Request): string {
  return new URL(request.url).origin;
}
