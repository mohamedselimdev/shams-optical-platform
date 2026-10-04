import { describe, expect, it } from "vitest";
import { allocate, applyBps, divRound, inclusiveTax, parseEgp, toEgpString } from "./money";

describe("money", () => {
  it("parses EGP strings without floating point error", () => {
    expect(parseEgp("149.5")).toBe(14950);
    expect(parseEgp("0.1")).toBe(10);
    expect(parseEgp("1,250.75")).toBe(125075);
    expect(parseEgp("١٢٠٫٥٠")).toBe(12050);
    expect(() => parseEgp("12.345")).toThrow();
    expect(() => parseEgp("abc")).toThrow();
  });

  it("formats piasters back to fixed strings", () => {
    expect(toEgpString(14950)).toBe("149.50");
    expect(toEgpString(-5)).toBe("-0.05");
  });

  it("rounds half away from zero", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(applyBps(1001, 1500)).toBe(150);
  });

  it("computes VAT contained in inclusive prices", () => {
    expect(inclusiveTax(11400, 1400)).toBe(1400);
    expect(inclusiveTax(0, 1400)).toBe(0);
  });

  it("allocates exactly, preserving the total", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
    expect(allocate(7, [0, 0])).toEqual([7, 0]);
  });
});
