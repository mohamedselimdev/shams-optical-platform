/**
 * Generates clean SVG product illustrations for the sample catalog (no external image hosting needed).
 * Real deployments replace these with uploaded product photography via the dashboard.
 */
export type FrameShape = "round" | "square" | "rectangle" | "cat-eye" | "aviator" | "oval" | "browline";

function lensPath(shape: FrameShape, cx: number, cy: number): string {
  switch (shape) {
    case "round":
      return `M ${cx - 62} ${cy} a 62 62 0 1 0 124 0 a 62 62 0 1 0 -124 0`;
    case "oval":
      return `M ${cx - 70} ${cy} a 70 52 0 1 0 140 0 a 70 52 0 1 0 -140 0`;
    case "square":
      return `M ${cx - 64} ${cy - 56} h 128 q 10 0 10 10 v 92 q 0 18 -18 18 h -112 q -18 0 -18 -18 v -92 q 0 -10 10 -10 z`;
    case "rectangle":
      return `M ${cx - 76} ${cy - 42} h 152 q 8 0 8 8 v 60 q 0 20 -20 20 h -128 q -20 0 -20 -20 v -60 q 0 -8 8 -8 z`;
    case "cat-eye":
      return `M ${cx - 74} ${cy - 30} q 60 -40 150 -28 q 6 50 -30 82 q -40 24 -86 6 q -40 -18 -34 -60 z`;
    case "aviator":
      return `M ${cx - 72} ${cy - 44} h 144 q 6 70 -46 96 q -26 12 -52 0 q -52 -26 -46 -96 z`;
    case "browline":
      return `M ${cx - 70} ${cy - 40} h 140 q 6 0 4 14 q -6 64 -70 70 q -64 -6 -78 -70 q -2 -14 4 -14 z`;
  }
}

export function frameSvg(opts: { shape: FrameShape; color: string; lensTint?: string; background?: string }): string {
  const bg = opts.background ?? "#f6f2ea";
  const tint = opts.lensTint ?? "rgba(255,255,255,0.35)";
  const left = lensPath(opts.shape, 230, 300);
  const right = lensPath(opts.shape, 570, 300);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img">
  <rect width="800" height="600" fill="${bg}"/>
  <ellipse cx="400" cy="470" rx="300" ry="18" fill="rgba(0,0,0,0.06)"/>
  <path d="${left}" fill="${tint}" stroke="${opts.color}" stroke-width="16" stroke-linejoin="round"/>
  <path d="${right}" fill="${tint}" stroke="${opts.color}" stroke-width="16" stroke-linejoin="round"/>
  <path d="M 330 286 q 70 -36 140 0" fill="none" stroke="${opts.color}" stroke-width="14" stroke-linecap="round"/>
  <path d="M 150 270 L 70 250" stroke="${opts.color}" stroke-width="14" stroke-linecap="round"/>
  <path d="M 650 270 L 730 250" stroke="${opts.color}" stroke-width="14" stroke-linecap="round"/>
</svg>`;
}
