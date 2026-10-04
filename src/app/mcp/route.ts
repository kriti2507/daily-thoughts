import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { buildServer } from "@/lib/mcp/server";
import { ACCESS_TTL, CORS, origin, preflight, SCOPE, verify } from "@/lib/mcp/oauth";

// The MCP endpoint. Every request needs an access token from /oauth/token;
// without one, the 401 points the app at the OAuth metadata so it can log in.

function unauthorized(request: Request): Response {
  const metadata = `${origin(request)}/.well-known/oauth-protected-resource/mcp`;
  return Response.json(
    { error: "invalid_token", error_description: "Missing or expired access token." },
    {
      status: 401,
      headers: {
        ...CORS,
        "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${metadata}", scope="${SCOPE}"`,
      },
    },
  );
}

async function handle(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (!verify("access", token, ACCESS_TTL)) {
    return unauthorized(request);
  }

  // Stateless: a new server and transport per request, nothing kept between.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await buildServer().connect(transport);
  const response = await transport.handleRequest(request);
  for (const [key, value] of Object.entries(CORS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
