import { describe, expect, it } from "vitest";
import { storagePath } from "@/lib/mascot-generation/library-thumbnail-store";

describe("storagePath", () => {
  it("separa cada miniatura por versão, dono, item e pose", () => {
    expect(storagePath("owner-1", "item-2", "normal")).toBe("v4/owner-1/item-2/normal.webp");
  });
});
