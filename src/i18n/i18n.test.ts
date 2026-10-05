import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import { createTranslator } from "./translate";
import { localizeContent } from "./localize";
import { extractKeys } from "../../scripts/i18n-extract.mjs";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("English catalog", () => {
  const catalog = en as Record<string, string>;
  const keys = extractKeys() as Map<string, string>;

  it("translates every Arabic interface string in src/", () => {
    const missing = [...keys.entries()].filter(([k]) => !(k in catalog)).map(([k, at]) => `${at}: ${k}`);
    expect(missing).toEqual([]);
  });

  it("keeps the same placeholders as the Arabic source", () => {
    const broken = Object.entries(catalog).filter(([ar, text]) => placeholders(ar).join() !== placeholders(text).join()).map(([ar]) => ar);
    expect(broken).toEqual([]);
  });

  it("contains no Arabic letters in translations (except the language switch's own name)", () => {
    const arabic = Object.entries(catalog).filter(([ar, text]) => ar !== "العربية" && /[\u0621-\u064A]/.test(text)).map(([ar]) => ar);
    expect(arabic).toEqual([]);
  });
});

describe("translator", () => {
  const t = createTranslator("en", { "طلب {0}": "Order {0}", "مدفوع": "Paid", "الحالة {0}": "Status {0}" });
  const ar = createTranslator("ar", {});

  it("falls back to the Arabic source when a string has no translation", () => {
    expect(t("نص جديد")).toBe("نص جديد");
    expect(ar("طلب {0}", ["SH-1"])).toBe("طلب SH-1");
  });

  it("translates templated messages produced elsewhere, including their known values", () => {
    expect(t.message("طلب SH-2026-000001")).toBe("Order SH-2026-000001");
    expect(t.message("الحالة مدفوع")).toBe("Status Paid");
  });

  it("formats numbers and direction per locale", () => {
    expect(t.number(1234)).toBe("1,234");
    expect(t.dir).toBe("ltr");
    expect(ar.dir).toBe("rtl");
  });
});

describe("localizeContent", () => {
  const row = { name: "شمس الزمالك", nameEn: "SHAMS Zamalek", description: "وصف", descriptionEn: "", items: [{ colorName: "أسود", colorNameEn: "Black" }], blocks: [1], blocksEn: [] };

  it("uses filled English fields for English visitors, nested ones included", () => {
    const out = localizeContent(row, "en");
    expect(out.name).toBe("SHAMS Zamalek");
    expect(out.items[0].colorName).toBe("Black");
    expect(out.description).toBe("وصف");
    expect(out.blocks).toEqual([1]);
  });

  it("returns Arabic content unchanged", () => {
    expect(localizeContent(row, "ar")).toBe(row);
  });
});
