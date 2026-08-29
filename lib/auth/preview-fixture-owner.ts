import "server-only";

import { createClient } from "@/lib/supabase/server";

export class PreviewFixtureOwnerError extends Error {
  constructor(readonly code: "FIXTURE_OWNER_NOT_CONFIGURED" | "FIXTURE_OWNER_REJECTED") {
    super("A sessão não está autorizada para a validação interna.");
  }
}

export async function requirePreviewFixtureOwner(userId: string) {
  const expectedEmail = process.env.SUPABASE_RECOVERY_TEST_EMAIL?.trim().toLowerCase();
  if (!expectedEmail) throw new PreviewFixtureOwnerError("FIXTURE_OWNER_NOT_CONFIGURED");
  const { data, error } = await (await createClient()).auth.getUser();
  const actualEmail = data.user?.email?.toLowerCase();
  if (error || data.user?.id !== userId || actualEmail !== expectedEmail) {
    throw new PreviewFixtureOwnerError("FIXTURE_OWNER_REJECTED");
  }
}
