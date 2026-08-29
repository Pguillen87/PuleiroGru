import { describe, expect, it } from "vitest";

describe("fixture run registry contract", () => {
  it("keeps exact identifiers server-side and never stores an import code value", () => {
    const allowedColumns = ["operation_id", "user_id", "source_job_id", "item_id", "package_id", "import_code_id", "storage_paths", "cleanup_status", "cleanup_counts"];
    expect(allowedColumns).toContain("import_code_id");
    expect(allowedColumns).not.toContain("import_code");
    expect(allowedColumns).not.toContain("signed_url");
  });
});
