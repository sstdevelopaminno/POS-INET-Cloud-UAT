import { describe, expect, it } from "vitest";
import { naturalCompareTableCode } from "@/lib/table-management";

describe("table natural sorting", () => {
  it("sorts table codes by natural order", () => {
    const codes = ["10", "A10", "A2", "B1", "A1", "2", "1", "B2", "C1"];
    const sorted = [...codes].sort(naturalCompareTableCode);
    expect(sorted).toEqual(["1", "2", "10", "A1", "A2", "A10", "B1", "B2", "C1"]);
  });
});
