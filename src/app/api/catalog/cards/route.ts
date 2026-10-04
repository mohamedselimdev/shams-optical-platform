import { type NextRequest, NextResponse } from "next/server";
import { productCardsByIds } from "@/modules/catalog/queries";

/** Public product cards by id (recently viewed). Only ACTIVE products; at most 12 ids. */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .filter((x) => /^[a-z0-9]{10,40}$/i.test(x))
    .slice(0, 12);
  const cards = await productCardsByIds(ids);
  return NextResponse.json(cards, { headers: { "cache-control": "public, max-age=60" } });
}
