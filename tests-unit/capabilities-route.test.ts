import { beforeEach, describe, expect, it, vi } from "vitest";

const requireBrowserIdentity = vi.fn();
const authErrorResponse = vi.fn((error: unknown) => error instanceof Error && error.message === "session"
  ? Response.json({ message: "Sua sessão terminou.", code: "SESSION_EXPIRED" }, { status: 401 })
  : null);
const getCapabilities = vi.fn();
const getMascotGenerationProvider = vi.fn(() => ({ getCapabilities }));

vi.mock("@/lib/auth/browser-auth", () => ({
  authErrorResponse,
  requireBrowserIdentity,
}));
vi.mock("@/lib/mascot-generation/provider", () => ({ getMascotGenerationProvider }));

describe("GET /api/mascot/capabilities", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireBrowserIdentity.mockResolvedValue({ uid: "qa-owner", mode: "supabase-session" });
    getCapabilities.mockResolvedValue({
      contractVersion: "v2",
      master: { ready: false, modelVersion: "qa", promptVersion: "qa", reasons: ["disabled"] },
      poses: { ready: false, workerVersion: "qa", catalogVersion: "web-poses-v1", templateVersion: "web-poses-v1", reasons: ["disabled"] },
      poseCatalog: {},
      incubator: { ready: false, enabled: true, workflowVersion: "async_incubator_v1", rankerVersion: "qa", subjectHintVersion: "qa", encoder: { ready: true, reasonCode: null, version: "qa" } },
    });
  });

  it("faz preflight autenticado sem attempt e sem criar efeito operacional", async () => {
    const { GET } = await import("@/app/api/mascot/capabilities/route");
    const response = await GET(new Request("https://puleiro.test/api/mascot/capabilities"));
    expect(response.status).toBe(200);
    expect(getCapabilities).toHaveBeenCalledTimes(1);
    const identity = getCapabilities.mock.calls[0]?.[0];
    expect(identity.ownerId).toBe("qa-owner");
    expect(identity.attemptId).toMatch(/^capabilities_[a-f0-9]{32}$/);
    expect(identity.attemptId).not.toBe("puleiro_attempt");
  });

  it("continua exigindo sessão", async () => {
    const authError = new Error("session");
    requireBrowserIdentity.mockRejectedValue(authError);
    const { GET } = await import("@/app/api/mascot/capabilities/route");
    const response = await GET(new Request("https://puleiro.test/api/mascot/capabilities"));
    expect(response.status).toBe(401);
    expect(getCapabilities).not.toHaveBeenCalled();
  });
});
