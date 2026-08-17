import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // A revogação global pode falhar sem impedir a saída deste dispositivo.
  } finally {
    // A saída deste dispositivo não pode depender da disponibilidade da revogação global.
    await supabase.auth.signOut({ scope: "local" });
  }

  return new NextResponse(null, { status: 204 });
}
