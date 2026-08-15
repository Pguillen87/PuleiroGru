import { afterEach, describe, expect, it } from "vitest";
import { isSupabaseConfigured, supabasePublicConfig } from "@/lib/supabase/config";

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
});

describe("configuração Supabase", () => {
  it("falha fechada quando a configuração pública está ausente", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(isSupabaseConfigured()).toBe(false);
    expect(() => supabasePublicConfig()).toThrow("Configuração pública do Supabase ausente");
  });

  it("expõe apenas URL e anon key públicas", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-public";
    expect(supabasePublicConfig()).toEqual({ url: "https://project.supabase.co", anonKey: "anon-public" });
  });
});
