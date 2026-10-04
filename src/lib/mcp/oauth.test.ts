import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { destination, pkceMatches, redirectUriAllowed, sign, verify } from "@/lib/mcp/oauth";

describe("sign / verify", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
  });
  afterEach(() => {
    delete process.env.ADMIN_SECRET;
  });

  it("round-trips a payload", () => {
    const token = sign("access", { client_id: "abc" })!;
    expect(verify("access", token)).toMatchObject({ client_id: "abc" });
  });

  it("rejects a value signed as another kind", () => {
    const refresh = sign("refresh", { client_id: "abc" })!;
    expect(verify("access", refresh)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const [, signature] = sign("access", { client_id: "abc" })!.split(".");
    const forged = Buffer.from(JSON.stringify({ client_id: "evil", k: "access", iat: 0 })).toString("base64url");
    expect(verify("access", `${forged}.${signature}`)).toBeNull();
  });

  it("expires after the ttl", () => {
    const issued = Date.UTC(2026, 0, 1);
    const token = sign("code", {}, issued)!;
    expect(verify("code", token, 300, issued + 300_000)).not.toBeNull();
    expect(verify("code", token, 300, issued + 301_000)).toBeNull();
  });

  it("stops accepting everything when the secret rotates", () => {
    const token = sign("access", {})!;
    process.env.ADMIN_SECRET = "rotated";
    expect(verify("access", token)).toBeNull();
  });

  it("is off with ADMIN_SECRET unset", () => {
    const token = sign("access", {})!;
    delete process.env.ADMIN_SECRET;
    expect(sign("access", {})).toBeNull();
    expect(verify("access", token)).toBeNull();
  });

  it("rejects garbage", () => {
    for (const value of [undefined, null, "", "abc", "a.b.c", "!!.??"]) {
      expect(verify("access", value)).toBeNull();
    }
  });
});

describe("redirectUriAllowed", () => {
  it.each([
    "https://claude.ai/api/mcp/auth_callback",
    "http://localhost:6274/oauth/callback",
    "http://127.0.0.1:33418/callback",
    "http://[::1]:8080/cb",
    "cursor://anysphere.cursor-retrieval/oauth/callback",
  ])("allows %s", (uri) => {
    expect(redirectUriAllowed(uri)).toBe(true);
  });

  it.each([
    "http://example.com/callback",
    "javascript:alert(1)",
    "data:text/html,hi",
    "intent://example.com#Intent;end",
    "x-safari-https://example.com",
    "not a url",
  ])("blocks %s", (uri) => {
    expect(redirectUriAllowed(uri)).toBe(false);
  });
});

describe("destination", () => {
  it("shows the host for web addresses and the full URI for app schemes", () => {
    expect(destination("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(destination("cursor://anysphere/cb")).toBe("cursor://anysphere/cb");
  });
});

describe("pkceMatches", () => {
  it("checks an S256 challenge", () => {
    const verifier = "a-long-random-verifier-string-0123456789";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches("other", challenge)).toBe(false);
  });
});
