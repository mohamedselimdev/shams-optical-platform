/**
 * Optical value helpers. Powers are stored as integer hundredths of a diopter,
 * pupillary distance as tenths of a millimetre.
 */

export function formatDiopter(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function parseDiopter(input: string): number {
  const match = /^([+-])?(\d{1,2})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) throw new RangeError(`Invalid diopter value: ${input}`);
  const [, sign, whole, frac = ""] = match;
  const value = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (value % 25 !== 0) throw new RangeError("Diopter values must be in 0.25 steps");
  return sign === "-" ? -value : value;
}

export function formatPd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.floor(value / 10)}${value % 10 ? `.${value % 10}` : ""}`;
}

export function parsePd(input: string): number {
  const match = /^(\d{2})(?:\.(\d))?$/.exec(input.trim());
  if (!match) throw new RangeError(`Invalid PD value: ${input}`);
  const value = Number(match[1]) * 10 + Number(match[2] ?? "0");
  if (value % 5 !== 0) throw new RangeError("PD must be in 0.5 mm steps");
  return value;
}

/** Selectable SPH values from -20.00 to +12.00 in 0.25 steps. */
export const SPH_RANGE = range(-2000, 1200, 25);
/** Selectable CYL values from -6.00 to +6.00 in 0.25 steps. */
export const CYL_RANGE = range(-600, 600, 25);
/** Selectable ADD values from +0.75 to +3.50 in 0.25 steps. */
export const ADD_RANGE = range(75, 350, 25);
export const AXIS_RANGE = range(0, 180, 1);
/** Single PD 50–80 mm; dual (monocular) 25–40 mm, both 0.5 mm steps (tenths). */
export const PD_RANGE = range(500, 800, 5);
export const MONO_PD_RANGE = range(250, 400, 5);

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}
