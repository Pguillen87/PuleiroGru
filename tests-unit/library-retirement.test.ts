import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { deleteLibraryItem } from "@/lib/mascot-generation/library-store";

describe("library retirement", () => {
  it("uses the authenticated transactional operation and supports replay", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await deleteLibraryItem(client, "owner", "item")).toBe(true);
    expect(await deleteLibraryItem(client, "owner", "item")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("retire_mascot_library_item", { p_item_id: "item" });
  });
  it("does not report success on unauthorized/not found or database failure", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await deleteLibraryItem(client, "owner", "item")).toBe(false);
    await expect(deleteLibraryItem(client, "owner", "item")).rejects.toThrow("Não foi possível excluir");
  });
});
