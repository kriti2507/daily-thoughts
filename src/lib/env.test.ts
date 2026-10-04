import { afterEach, describe, expect, it, vi } from "vitest";

import { optionalEnv, optionalNumberEnv, requireEnv, requireNumberEnv } from "@/lib/env";

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

  it("returns the fallback when set to an empty string", () => {
    vi.stubEnv("SOME_KEY", "");
    expect(optionalEnv("SOME_KEY", "fallback")).toBe("fallback");
  });
});

describe("requireNumberEnv", () => {
  it("returns the number when the value is a valid integer", () => {
    vi.stubEnv("SOME_KEY", "4242");
    expect(requireNumberEnv("SOME_KEY")).toBe(4242);
  });

  it("returns a negative number correctly", () => {
    vi.stubEnv("SOME_KEY", "-1001234567890");
    expect(requireNumberEnv("SOME_KEY")).toBe(-1001234567890);
  });

  it("throws a named error when the value is not numeric", () => {
    vi.stubEnv("SOME_KEY", "not-a-number");
    expect(() => requireNumberEnv("SOME_KEY")).toThrow(
      "Environment variable must be a number: SOME_KEY",
    );
  });

  it("throws the missing error when unset", () => {
    vi.stubEnv("SOME_KEY", undefined);
    expect(() => requireNumberEnv("SOME_KEY")).toThrow(
      "Missing required environment variable: SOME_KEY",
    );
  });
});

describe("optionalNumberEnv", () => {
  it("returns the number when set", () => {
    vi.stubEnv("SOME_KEY", "3");
    expect(optionalNumberEnv("SOME_KEY", 5)).toBe(3);
  });

  it("returns the fallback when unset or empty", () => {
    vi.stubEnv("SOME_KEY", undefined);
    expect(optionalNumberEnv("SOME_KEY", 5)).toBe(5);
    vi.stubEnv("SOME_KEY", "");
    expect(optionalNumberEnv("SOME_KEY", 5)).toBe(5);
  });

  it("throws a named error when set but not numeric", () => {
    vi.stubEnv("SOME_KEY", "lots");
    expect(() => optionalNumberEnv("SOME_KEY", 5)).toThrow(
      "Environment variable must be a number: SOME_KEY",
    );
  });
});
