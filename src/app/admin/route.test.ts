import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE } from "@/lib/admin";
import { GET } from "@/app/admin/route";

const SECRET = "test-admin-secret";

function buildRequest(key?: string): Request {
  const url = new URL("http://localhost/admin");
  if (key !== undefined) {
    url.searchParams.set("key", key);
  }
  return new Request(url);
}

beforeEach(() => {
  vi.stubEnv("ADMIN_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /admin", () => {
  it("sets the admin cookie and redirects home for the right key", async () => {
    const response = await GET(buildRequest(SECRET));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${ADMIN_COOKIE}=${SECRET}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
  });

  it("rejects a wrong key without setting a cookie", async () => {
    const response = await GET(buildRequest("wrong"));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a request with no key", async () => {
    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
