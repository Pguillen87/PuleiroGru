import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { getAttemptId, jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createTraceContext, traceResponse } from "@/lib/observability/mascot-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const [identity, attemptId] = await Promise.all([requireBrowserIdentity(request), getAttemptId()]);
    if (!attemptId) {
      return NextResponse.json({ message: "Nascimento não encontrado.", code: "ATTEMPT_REQUIRED" }, { status: 404 });
    }
    const trace = createTraceContext(attemptId, false);
    const capabilities = await getMascotGenerationProvider().getCapabilities(
      jobIdentity(identity.uid, attemptId, trace),
    );
    return traceResponse(NextResponse.json({ capabilities }), trace);
  } catch (error) {
    return integrationErrorResponse(error, "CAPABILITIES_UNAVAILABLE", "Não foi possível conferir a oficina de poses agora.");
  }
}
