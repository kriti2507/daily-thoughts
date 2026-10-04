import { json, origin, preflight, SCOPE } from "@/lib/mcp/oauth";

// Served at /.well-known/oauth-authorization-server (see next.config.ts).
export function GET(request: Request): Response {
  const base = origin(request);
  return json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
  });
}

export const OPTIONS = preflight;
