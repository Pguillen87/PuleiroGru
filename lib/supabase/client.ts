"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicConfig } from "./config";

export function createClient() {
  const { url, anonKey } = supabasePublicConfig();
  return createBrowserClient(url, anonKey, {
    cookieOptions: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}
