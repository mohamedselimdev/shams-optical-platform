import { storage, sniff } from "@/server/storage";
import { isDomainError } from "@/server/errors";

/**
 * Serves PUBLIC uploads when the local storage driver is used (S3 serves its own public URLs).
 * Private files (prescriptions) are never reachable here: the driver resolves keys inside the
 * public directory only. Content type comes from magic bytes, not the file extension.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  try {
    const body = await storage().get("PUBLIC", key.join("/"));
    if (!body) return new Response("Not found", { status: 404 });
    const kind = sniff(body);
    if (!kind || !kind.mime.startsWith("image/")) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": kind.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response("Not found", { status: 404 });
    throw e;
  }
}
