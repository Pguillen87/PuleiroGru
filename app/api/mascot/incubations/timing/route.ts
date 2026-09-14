import { NextResponse } from "next/server";
import { requireBrowserIdentity } from "@/lib/auth/browser-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { integrationErrorResponse } from "@/lib/mascot-generation/api-errors";

export async function GET(request: Request) {
  try {
    await requireBrowserIdentity(request);
    const admin = createAdminClient();
    if (!admin) throw new Error("TIMING_UNAVAILABLE");
    const { data, error } = await admin.rpc("mascot_incubation_timing");
    if (error || !data) throw new Error("TIMING_UNAVAILABLE");
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return integrationErrorResponse(error, "TIMING_UNAVAILABLE", "A estimativa de tempo está indisponível.");
  }
}
