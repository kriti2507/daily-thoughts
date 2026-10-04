import {
  type Client,
  clientSecretFor,
  json,
  oauthError,
  preflight,
  redirectUriAllowed,
  sign,
} from "@/lib/mcp/oauth";

// Dynamic client registration (RFC 7591). Open to anyone: what protects the
// data is the password on the consent page, which also shows where the code
// will be sent. The client id is the signed registration itself.
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON.");
  }

  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === "string")) {
    return oauthError("invalid_redirect_uri", "redirect_uris must be a non-empty list.");
  }
  const blocked = uris.find((uri) => !redirectUriAllowed(uri));
  if (blocked) {
    return oauthError("invalid_redirect_uri", `Redirect URI not allowed: ${blocked}`);
  }

  const method =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "client_secret_basic";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    return oauthError("invalid_client_metadata", `Unsupported token_endpoint_auth_method: ${method}`);
  }

  const client: Client = {
    redirect_uris: uris,
    token_endpoint_auth_method: method,
    ...(typeof body.client_name === "string" ? { client_name: body.client_name.slice(0, 100) } : {}),
  };
  const clientId = sign("client", client);
  if (!clientId) {
    return oauthError("temporarily_unavailable", "MCP is off: ADMIN_SECRET is not set.", 503);
  }

  return json(
    {
      ...client,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(method === "none"
        ? {}
        : { client_secret: clientSecretFor(clientId), client_secret_expires_at: 0 }),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}

export const OPTIONS = preflight;
