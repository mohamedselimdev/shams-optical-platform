import { redirect } from "next/navigation";

/** Legacy/alias URL: /search?… is the same listing as /shop?… */
export default async function SearchAlias({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v ? [v] : []) sp.append(k, x);
  redirect(sp.size ? `/shop?${sp}` : "/shop");
}
