import { json, origin, preflight, SCOPE } from "@/lib/mcp/oauth";

// Served at /.well-known/oauth-protected-resource[/mcp] (see next.config.ts).
// Tells an MCP client that /mcp is protected and where to log in.
export function GET(request: Request): Response {
  const base = origin(request);
  return json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
  });
}

export const OPTIONS = preflight;
