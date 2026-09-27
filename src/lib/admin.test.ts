import { afterEach, describe, expect, it, vi } from "vitest";

import { isAdminSecret } from "@/lib/admin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAdminSecret", () => {
  it("accepts the configured secret", () => {
    vi.stubEnv("ADMIN_SECRET", "hunter2");
    expect(isAdminSecret("hunter2")).toBe(true);
  });

  it("rejects a different secret", () => {
    vi.stubEnv("ADMIN_SECRET", "hunter2");
    expect(isAdminSecret("hunter3")).toBe(false);
  });

  it("rejects a missing candidate", () => {
    vi.stubEnv("ADMIN_SECRET", "hunter2");
    expect(isAdminSecret(undefined)).toBe(false);
  });

  it("rejects everything when ADMIN_SECRET is unset, including an empty candidate", () => {
    vi.stubEnv("ADMIN_SECRET", undefined);
    expect(isAdminSecret("")).toBe(false);
    expect(isAdminSecret("anything")).toBe(false);
  });
});
