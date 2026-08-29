import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Master image BFF route", () => {
  it("serves the Modal-selected derivative without a silent display fallback", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/mascot/jobs/[jobId]/master/[masterId]/route.ts"), "utf8");

    expect(source).not.toContain("prepareMascotDisplayAsset");
    expect(source).toContain("const image = sourceImage;");
  });
});
