import { afterEach, describe, expect, it, vi } from "vitest";
import { MutationRequestRejected, requireTrustedMutationRequest } from "@/lib/security/mutation-request";

describe("proteção das rotas mutáveis", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("aceita mesma origem e JSON", () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://localhost:3000/api/mascot/jobs/job/pose-generations", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    });
    expect(() => requireTrustedMutationRequest(request, { contentTypes: ["application/json"] })).not.toThrow();
  });

  it.each([
    ["origem ausente", {}],
    ["origem inválida", { origin: "https://evil.example", "content-type": "application/json" }],
    ["cross-site", { origin: "http://localhost:3000", "content-type": "application/json", "sec-fetch-site": "cross-site" }],
  ])("rejeita %s", (_name, headers) => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://localhost:3000/api/mascot/jobs/job/pose-generations", { method: "POST", headers });
    expect(() => requireTrustedMutationRequest(request, { contentTypes: ["application/json"] }))
      .toThrow(MutationRequestRejected);
  });

  it("falha fechado em produção sem allowlist", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PULEIRO_ALLOWED_ORIGINS", "");
    const request = new Request("https://puleiro.example/api", {
      method: "POST",
      headers: { origin: "https://puleiro.example", "content-type": "application/json" },
    });
    expect(() => requireTrustedMutationRequest(request, { contentTypes: ["application/json"] }))
      .toThrowError(/origem/i);
  });
});
