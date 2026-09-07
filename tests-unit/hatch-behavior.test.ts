import { expect, test } from "vitest";
import { POST } from "@/app/api/mascot/incubations/[jobId]/hatch/route";

test("route file is imported and defined", () => {
  expect(typeof POST).toBe("function");
});
