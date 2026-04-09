import { describe, expect, it } from "vitest";
import { verifyCronSecret } from "../lib/cron-auth.js";

describe("verifyCronSecret", () => {
  const secret = "x".repeat(32);

  it("accepts a correct Bearer token", () => {
    expect(verifyCronSecret(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(verifyCronSecret(undefined, secret)).toBe(false);
  });

  it("rejects a header without the Bearer prefix", () => {
    expect(verifyCronSecret(secret, secret)).toBe(false);
  });

  it("rejects a wrong secret of the same length", () => {
    expect(verifyCronSecret(`Bearer ${"y".repeat(32)}`, secret)).toBe(false);
  });

  it("rejects a wrong secret of a different length", () => {
    // Different-length provided must still return false without throwing
    // (timingSafeEqual throws on length mismatch, so the guard matters).
    expect(() => verifyCronSecret(`Bearer short`, secret)).not.toThrow();
    expect(verifyCronSecret(`Bearer short`, secret)).toBe(false);
  });

  it("rejects an empty Bearer token", () => {
    expect(verifyCronSecret("Bearer ", secret)).toBe(false);
  });
});
