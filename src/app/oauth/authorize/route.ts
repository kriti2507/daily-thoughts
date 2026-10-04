import { isAdminSecret } from "@/lib/admin";
import { destination, loadClient, PENDING_TTL, SCOPE, sign, verify } from "@/lib/mcp/oauth";

// The page a person sees mid-OAuth: where they'll be sent, who is asking, and
// a password box. The password is ADMIN_SECRET, the same key /admin takes. On
// success the browser goes back to the app with an authorization code.

interface Pending {
  client_id: string;
  client_name?: string;
  redirect_uri: string;
  code_challenge: string;
  state: string | null;
  scope: string;
  resource: string | null;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;
// Best-effort per-IP limit; resets on cold starts.
const attempts = new Map<string, number[]>();

function tooManyAttempts(ip: string, now = Date.now()): boolean {
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(ip, recent);
  return recent.length >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  attempts.set(ip, [...(attempts.get(ip) ?? []), Date.now()]);
}

// Nothing on this page should ever be framed or cached.
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page(body: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to daily-thoughts</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 26rem; margin: 4rem auto; padding: 0 1rem; color: #222; }
  .dest { font-size: 1.15rem; }
  .muted { color: #666; }
  .error { color: #b3261e; }
  input, button { font: inherit; padding: .6rem; width: 100%; box-sizing: border-box; margin-top: .5rem; }
</style></head>
<body>${body}</body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

function invalid(message: string): Response {
  return page(`<p>${escape(message)} Start again from your app.</p>`, 400);
}

function consent(pending: Pending, req: string, error?: string, status = 200): Response {
  const name = pending.client_name
    ? `<p class="muted">It calls itself “${escape(pending.client_name)}”.</p>`
    : "";
  const err = error ? `<p class="error">${escape(error)}</p>` : "";
  return page(
    `<h1>Connect an app to daily-thoughts</h1>
  <p class="dest">After you allow, you'll be sent to <strong>${escape(destination(pending.redirect_uri))}</strong>.</p>
  ${name}
  <p>It will be able to read all your thoughts, check-ins, stickers and categories. Only continue if you started this from that app just now.</p>
  ${err}
  <form method="post" action="/oauth/authorize">
    <input type="hidden" name="req" value="${escape(req)}">
    <label>Admin secret<input type="password" name="password" autofocus required></label>
    <button type="submit">Allow</button>
  </form>`,
    status,
  );
}

function redirectTo(uri: string, params: Record<string, string | null>): Response {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) {
      url.searchParams.set(key, value);
    }
  }
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: url.toString() } });
}

export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("client_id");
  const client = loadClient(clientId);
  if (!client) {
    return invalid("This app isn't registered, or its registration has expired.");
  }
  const redirectUri =
    params.get("redirect_uri") ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : null);
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return invalid("The redirect address doesn't match the app's registration.");
  }

  // From here on, errors go back to the app, which has proven its address.
  const state = params.get("state");
  const challenge = params.get("code_challenge");
  if (params.get("response_type") !== "code") {
    return redirectTo(redirectUri, { error: "unsupported_response_type", state });
  }
  if (!challenge || params.get("code_challenge_method") !== "S256") {
    return redirectTo(redirectUri, {
      error: "invalid_request",
      error_description: "PKCE with S256 is required.",
      state,
    });
  }

  const pending: Pending = {
    client_id: clientId!,
    ...(client.client_name ? { client_name: client.client_name } : {}),
    redirect_uri: redirectUri,
    code_challenge: challenge,
    state,
    scope: SCOPE,
    resource: params.get("resource"),
  };
  const req = sign("pending", pending);
  if (!req) {
    return invalid("MCP is off: ADMIN_SECRET is not set.");
  }
  return consent(pending, req);
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const req = String(form.get("req") ?? "");
  const pending = verify<Pending>("pending", req, PENDING_TTL);
  if (!pending) {
    return invalid("This login link is invalid or has expired.");
  }
  const ip = clientIp(request);
  if (tooManyAttempts(ip)) {
    return consent(pending, req, "Too many attempts. Wait a minute and try again.", 429);
  }
  if (!isAdminSecret(String(form.get("password") ?? ""))) {
    recordFailure(ip);
    return consent(pending, req, "Wrong secret.", 401);
  }

  // sign() overwrites the pending login's kind and timestamp with the code's.
  const code = sign("code", pending)!;
  return redirectTo(pending.redirect_uri, { code, state: pending.state });
}
