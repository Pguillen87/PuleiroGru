import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabasePublicConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (updates) => {
        try {
          updates.forEach(({ name, value, options }) => cookieStore.set(name, value, {
            ...options,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          }));
        } catch {
          // Server Components não escrevem cookies; o Proxy renova a sessão.
        }
      },
    },
  });
}
