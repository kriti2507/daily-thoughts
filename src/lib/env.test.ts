import { afterEach, describe, expect, it, vi } from "vitest";

import { optionalEnv, requireEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv("SOME_KEY", "some-value");
    expect(requireEnv("SOME_KEY")).toBe("some-value");
  });

  it("throws a named error when unset", () => {
    vi.stubEnv("SOME_KEY", undefined);
    expect(() => requireEnv("SOME_KEY")).toThrow(
      "Missing required environment variable: SOME_KEY",
    );
  });

  it("treats an empty string as unset", () => {
    vi.stubEnv("SOME_KEY", "");
    expect(() => requireEnv("SOME_KEY")).toThrow(
      "Missing required environment variable: SOME_KEY",
    );
  });
});

describe("optionalEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv("SOME_KEY", "some-value");
    expect(optionalEnv("SOME_KEY", "fallback")).toBe("some-value");
  });

  it("returns the fallback when unset", () => {
    vi.stubEnv("SOME_KEY", undefined);
    expect(optionalEnv("SOME_KEY", "fallback")).toBe("fallback");
  });
});
