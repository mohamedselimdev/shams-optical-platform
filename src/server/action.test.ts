import { describe, expect, it, vi } from "vitest";
vi.mock("./logger", () => ({ logger: { error: vi.fn() } }));
import { formToNested } from "./action";

describe("formToNested", () => {
  it("builds nested arrays, compacts sparse indexes and ignores prototype keys", () => {
    const f = new FormData();
    f.append("name", "x");
    f.append("variants.0.sku", "A");
    f.append("variants.3.sku", "B");
    f.append("collectionIds[]", "c1");
    f.append("collectionIds[]", "c2");
    f.append("__proto__.polluted", "1");
    const out = formToNested(f);
    expect(out).toEqual({ name: "x", variants: [{ sku: "A" }, { sku: "B" }], collectionIds: ["c1", "c2"] });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
