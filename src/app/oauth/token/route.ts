import { timingSafeEqual } from "node:crypto";

import {
  ACCESS_TTL,
  clientSecretFor,
  CODE_TTL,
  json,
  loadClient,
  oauthError,
  pkceMatches,
  preflight,
  REFRESH_TTL,
  sign,
  verify,
} from "@/lib/mcp/oauth";

interface Grant {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource: string | null;
}

interface TokenClaims {
  client_id: string;
  scope: string;
  resource: string | null;
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// client_secret_basic sends id and secret in the Authorization header,
// client_secret_post and public clients send them in the form.
function clientCredentials(request: Request, form: FormData): { id: string; secret: string | null } {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    return {
      id: decodeURIComponent(decoded.slice(0, colon)),
      secret: decodeURIComponent(decoded.slice(colon + 1)),
    };
  }
  const secret = form.get("client_secret");
  return { id: String(form.get("client_id") ?? ""), secret: secret === null ? null : String(secret) };
}

function issue(claims: TokenClaims): Response {
  const { client_id, scope, resource } = claims;
  return json({
    access_token: sign("access", { client_id, scope, resource }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: sign("refresh", { client_id, scope, resource }),
    scope,
  });
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return oauthError("invalid_request", "Body must be form-encoded.");
  }

  const { id, secret } = clientCredentials(request, form);
  const client = loadClient(id);
  if (!client) {
    return oauthError("invalid_client", "Unknown client.", 401);
  }
  if (client.token_endpoint_auth_method !== "none" && !sameSecret(secret ?? "", clientSecretFor(id))) {
    return oauthError("invalid_client", "Wrong client secret.", 401);
  }

  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") {
    const grant = verify<Grant>("code", String(form.get("code") ?? ""), CODE_TTL);
    if (!grant || grant.client_id !== id) {
      return oauthError("invalid_grant", "The authorization code is invalid or has expired.");
    }
    const redirectUri = form.get("redirect_uri");
    if (redirectUri !== null && redirectUri !== grant.redirect_uri) {
      return oauthError("invalid_grant", "redirect_uri doesn't match the authorization request.");
    }
    if (!pkceMatches(String(form.get("code_verifier") ?? ""), grant.code_challenge)) {
      return oauthError("invalid_grant", "code_verifier doesn't match the code challenge.");
    }
    return issue(grant);
  }

  if (grantType === "refresh_token") {
    const claims = verify<TokenClaims>("refresh", String(form.get("refresh_token") ?? ""), REFRESH_TTL);
    if (!claims || claims.client_id !== id) {
      return oauthError("invalid_grant", "The refresh token is invalid or has expired.");
    }
    return issue(claims);
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export const OPTIONS = preflight;
