import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { jobIdentity } from "@/lib/mascot-generation/attempt";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";
import { getMascotGenerationProvider } from "@/lib/mascot-generation/provider";
import { createTraceContext, traceResponse } from "@/lib/observability/mascot-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    // Capabilities is a side-effect-free preflight. It must not depend on an
    // operational attempt cookie or create/reuse another birth's identity.
    const preflightAttemptId = `capabilities_${crypto.randomUUID().replaceAll("-", "")}`;
    const trace = createTraceContext(preflightAttemptId, false);
    const capabilities = await getMascotGenerationProvider().getCapabilities(
      jobIdentity(identity.uid, preflightAttemptId, trace),
    );
    return traceResponse(NextResponse.json({ capabilities }), trace);
  } catch (error) {
    return integrationErrorResponse(error, "CAPABILITIES_UNAVAILABLE", "Não foi possível conferir a oficina de poses agora.");
  }
}
