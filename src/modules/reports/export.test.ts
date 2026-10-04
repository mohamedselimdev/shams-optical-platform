import { describe, expect, it } from "vitest";
import { toCsv, safeCell } from "./export";

describe("report export", () => {
  it("escapes CSV, converts piasters and blocks formula injection", () => {
    const csv = toCsv(
      [{ key: "name", label: "الاسم", type: "text" }, { key: "total", label: "الإجمالي", type: "money" }],
      [{ name: '=HYPERLINK("x")', total: 123456 }, { name: "a,b", total: 5 }],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")",1234.56`);
    expect(csv).toContain(`"a,b",0.05`);
    expect(safeCell("-1+2")).toBe("'-1+2");
  });
});
