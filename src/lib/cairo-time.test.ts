import { describe, expect, it } from "vitest";
import { cairoDate, cairoDayEnd, cairoDayStart, addDays } from "./cairo-time";

describe("cairo time", () => {
  it("handles winter (UTC+2) and summer DST (UTC+3) offsets", () => {
    expect(cairoDayStart("2026-01-15").toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(cairoDayStart("2026-07-15").toISOString()).toBe("2026-07-14T21:00:00.000Z");
    expect(cairoDayEnd("2026-01-15").toISOString()).toBe("2026-01-15T21:59:59.999Z");
  });
  it("derives the Cairo calendar date from an instant", () => {
    expect(cairoDate(new Date("2026-10-04T23:30:00Z"))).toBe("2026-10-05");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
