import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("enquadramento do Master durante poses", () => {
  it("usa contain apenas no estágio de geração das poses", () => {
    const component = readFileSync("components/stage/PuleiroStage.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");

    expect(component).toContain('state === "generating-poses" ? " stage--master-reference"');
    expect(css).toMatch(/\.stage--master-reference\s+\.stage__art\s+img\s*\{[\s\S]*?object-fit:\s*contain;/);
    expect(css).toMatch(/\.stage--master-reference\s+\.stage__art\s+img\s*\{[\s\S]*?object-position:\s*center;/);
  });
});
