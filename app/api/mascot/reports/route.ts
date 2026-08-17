import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { authErrorResponse } from "@/lib/auth/browser-auth";
import { listGenerationMetrics, metricSummary } from "@/lib/mascot-generation/telemetry-store";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const identity = await requireBrowserIdentity(request);
    if (identity.mode !== "supabase-session") return NextResponse.json({ message: "Entre em sua conta para ver o relatório." }, { status: 401 });
    const metrics = await listGenerationMetrics(await createClient(), identity.uid);
    return NextResponse.json({ metrics, summary: metricSummary(metrics) });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ message: "Não foi possível abrir o relatório." }, { status: 500 });
  }
}
