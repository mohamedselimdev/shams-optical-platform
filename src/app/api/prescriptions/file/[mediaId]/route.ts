import { getCustomerActor, getStaffActor } from "@/server/auth/session";
import { readPrescriptionFile } from "@/modules/prescriptions/service";
import { isDomainError } from "@/server/errors";

/** Private prescription files: owner or authorised staff only (staff access is audited). */
export async function GET(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const actor = (await getStaffActor()) ?? (await getCustomerActor());
  try {
    const file = await readPrescriptionFile(actor, mediaId);
    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="prescription"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response("Not found", { status: e.code === "FORBIDDEN" ? 403 : 404 });
    throw e;
  }
}
