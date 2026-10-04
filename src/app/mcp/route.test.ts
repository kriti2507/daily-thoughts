import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mcp/journal", () => ({
  loadJournal: vi.fn(async (from: string | null, to: string | null) => ({
    time_zone: "UTC",
    questions: [],
    categories: [],
    days: [{ day: from ?? "any", to, sticker: null, thoughts: [], check_in: [] }],
  })),
}));

import { POST as mcp } from "@/app/mcp/route";
import { GET as authorizeGet, POST as authorizePost } from "@/app/oauth/authorize/route";
import { POST as register } from "@/app/oauth/register/route";
import { POST as token } from "@/app/oauth/token/route";

const BASE = "https://thoughts.example";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "verifier-0123456789-0123456789-0123456789";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

function form(values: Record<string, string>, headers: Record<string, string> = {}): RequestInit {
  return { method: "POST", body: new URLSearchParams(values), headers };
}

async function registerClient(extra: object = {}) {
  const response = await register(
    new Request(`${BASE}/oauth/register`, {
      method: "POST",
      body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: "Claude", ...extra }),
    }),
  );
  expect(response.status).toBe(201);
  return response.json();
}

async function authorize(clientId: string, password: string): Promise<Response> {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "xyz",
  });
  const page = await authorizeGet(new Request(`${BASE}/oauth/authorize?${query}`));
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain("<strong>claude.ai</strong>");
  expect(html).toContain("It calls itself “Claude”");
  const req = /name="req" value="([^"]+)"/.exec(html)![1];
  return authorizePost(
    new Request(`${BASE}/oauth/authorize`, form({ req, password }, { "x-forwarded-for": "1.2.3.4" })),
  );
}

async function login(): Promise<string> {
  const client = await registerClient();
  const approved = await authorize(client.client_id, "dev-secret");
  expect(approved.status).toBe(302);
  const location = new URL(approved.headers.get("location")!);
  expect(location.origin + location.pathname).toBe(REDIRECT);
  expect(location.searchParams.get("state")).toBe("xyz");

  const response = await token(
    new Request(
      `${BASE}/oauth/token`,
      form({
        grant_type: "authorization_code",
        code: location.searchParams.get("code")!,
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
        client_id: client.client_id,
        client_secret: client.client_secret,
      }),
    ),
  );
  expect(response.status).toBe(200);
  const tokens = await response.json();
  expect(tokens.token_type).toBe("Bearer");
  return tokens.access_token;
}

function rpc(accessToken: string | null, method: string, params: object = {}) {
  return mcp(
    new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
}

describe("MCP over OAuth", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "dev-secret";
  });
  afterEach(() => {
    delete process.env.ADMIN_SECRET;
  });

  it("asks for a token, pointing at the OAuth metadata", async () => {
    const response = await rpc(null, "tools/list");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it("logs in and calls get_data", async () => {
    const accessToken = await login();

    const init = await rpc(accessToken, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe("daily-thoughts");

    const list = await rpc(accessToken, "tools/list");
    const tools = (await list.json()).result.tools;
    expect(tools.map((t: { name: string }) => t.name)).toEqual(["get_data"]);

    const call = await rpc(accessToken, "tools/call", {
      name: "get_data",
      arguments: { from_date: "2026-10-01" },
    });
    const result = (await call.json()).result;
    expect(JSON.parse(result.content[0].text).days[0].day).toBe("2026-10-01");

    const bad = await rpc(accessToken, "tools/call", {
      name: "get_data",
      arguments: { to_date: "October 1st" },
    });
    expect((await bad.json()).result.isError).toBe(true);
  });

  it("refuses the wrong password", async () => {
    const client = await registerClient();
    const response = await authorize(client.client_id, "wrong");
    expect(response.status).toBe(401);
    expect(await response.text()).toContain("Wrong secret.");
  });

  it("refuses a code without the PKCE verifier", async () => {
    const client = await registerClient({ token_endpoint_auth_method: "none" });
    expect(client.client_secret).toBeUndefined();
    const approved = await authorize(client.client_id, "dev-secret");
    const code = new URL(approved.headers.get("location")!).searchParams.get("code")!;
    const response = await token(
      new Request(
        `${BASE}/oauth/token`,
        form({ grant_type: "authorization_code", code, client_id: client.client_id, code_verifier: "nope" }),
      ),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_grant");
  });

  it("refuses a refresh token used as an access token", async () => {
    const client = await registerClient();
    const approved = await authorize(client.client_id, "dev-secret");
    const code = new URL(approved.headers.get("location")!).searchParams.get("code")!;
    const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64");
    const tokens = await (
      await token(
        new Request(
          `${BASE}/oauth/token`,
          form(
            { grant_type: "authorization_code", code, code_verifier: VERIFIER },
            { authorization: `Basic ${basic}` },
          ),
        ),
      )
    ).json();
    expect((await rpc(tokens.refresh_token, "tools/list")).status).toBe(401);
  });

  it("rejects a non-loopback http redirect at registration", async () => {
    const response = await register(
      new Request(`${BASE}/oauth/register`, {
        method: "POST",
        body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
