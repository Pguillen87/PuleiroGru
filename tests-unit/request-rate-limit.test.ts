import { describe, expect, it } from "vitest";
import { consumeRequestBudget } from "@/lib/security/request-rate-limit";

describe("request rate limiter", () => {
  it("allows the configured budget and rejects the next request", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(consumeRequestBudget(key, 2, 60_000, 1_000).allowed).toBe(true);
    expect(consumeRequestBudget(key, 2, 60_000, 1_001).allowed).toBe(true);
    const limited = consumeRequestBudget(key, 2, 60_000, 1_002);
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBe(60);
  });

  it("starts a new window after expiration", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(consumeRequestBudget(key, 1, 1_000, 1_000).allowed).toBe(true);
    expect(consumeRequestBudget(key, 1, 1_000, 2_000).allowed).toBe(true);
  });
});
