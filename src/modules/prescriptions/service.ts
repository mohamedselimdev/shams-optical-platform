import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, type CustomerActor, actorId, assertCan } from "@/server/rbac/actor";
import { forbidden, invalid, notFound } from "@/server/errors";
import { storage, storeUpload } from "@/server/storage";
import { prescriptionMetaSchema, prescriptionValuesSchema, type PrescriptionValues } from "./schema";

/**
 * Prescriptions are private health data. Customers only ever see their own; staff access
 * requires `prescriptions.read` and every staff view or file download is audited.
 */

export async function createPrescription(
  actor: CustomerActor,
  input: { meta: unknown; values?: unknown; file?: File | null },
) {
  const meta = prescriptionMetaSchema.parse(input.meta);
  const hasFile = Boolean(input.file && input.file.size > 0);
  const values: PrescriptionValues | null = input.values ? prescriptionValuesSchema.parse(input.values) : null;
  if (!values && !hasFile) throw invalid("أدخل قيم الوصفة أو ارفع صورة لها");
  const asset = hasFile ? await storeUpload(input.file!, "prescription", actor.userId) : null;
  return db.prescription.create({
    data: {
      customerId: actor.customerId,
      ...meta,
      ...(values ?? {}),
      pdType: values?.pdType ?? "SINGLE",
      fileId: asset?.id ?? null,
    },
  });
}

export async function listMyPrescriptions(actor: CustomerActor) {
  return db.prescription.findMany({
    where: { customerId: actor.customerId, isArchived: false },
    orderBy: { createdAt: "desc" },
    include: { file: { select: { id: true, mimeType: true, originalName: true } } },
  });
}

export async function archiveMyPrescription(actor: CustomerActor, id: string) {
  const rx = await db.prescription.findFirst({ where: { id, customerId: actor.customerId } });
  if (!rx) throw notFound("الوصفة");
  await db.prescription.update({ where: { id }, data: { isArchived: true } });
}

/** Ownership-checked fetch for checkout/cart use. */
export async function getOwnedPrescription(customerId: string, id: string) {
  const rx = await db.prescription.findFirst({ where: { id, customerId, isArchived: false } });
  if (!rx) throw notFound("الوصفة");
  return rx;
}

export async function staffGetPrescription(actor: Actor, id: string, reason: string) {
  assertCan(actor, "prescriptions.read");
  const rx = await db.prescription.findUnique({
    where: { id },
    include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } }, file: { select: { id: true, mimeType: true, originalName: true } } },
  });
  if (!rx) throw notFound("الوصفة");
  await audit(db, actor, { action: "prescription.view", entityType: "prescription", entityId: id, metadata: { reason, customerId: rx.customerId } });
  return rx;
}

export async function staffListPrescriptions(actor: Actor, filter: { status?: "PENDING_REVIEW" | "VERIFIED" | "REJECTED"; page?: number }) {
  assertCan(actor, "prescriptions.read");
  const page = Math.max(filter.page ?? 1, 1);
  const where = { ...(filter.status ? { status: filter.status } : {}), isArchived: false };
  const [items, total] = await Promise.all([
    db.prescription.findMany({
      where,
      // List view deliberately excludes optical values; they are only loaded (and audited) on the detail view.
      select: { id: true, label: true, status: true, createdAt: true, fileId: true, customer: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
    }),
    db.prescription.count({ where }),
  ]);
  return { items, total, page, pageSize: 30 };
}

export async function reviewPrescription(
  actor: Actor,
  id: string,
  input: { decision: "VERIFIED" | "REJECTED"; note?: string; values?: unknown },
) {
  assertCan(actor, "prescriptions.review");
  const values = input.values ? prescriptionValuesSchema.parse(input.values) : null;
  return db.$transaction(async (tx) => {
    const rx = await tx.prescription.findUnique({ where: { id } });
    if (!rx) throw notFound("الوصفة");
    if (input.decision === "VERIFIED" && !values && rx.odSph === null && rx.osSph === null) {
      throw invalid("يجب إدخال قيم الوصفة من الصورة قبل الاعتماد");
    }
    const updated = await tx.prescription.update({
      where: { id },
      data: { ...(values ?? {}), status: input.decision, reviewNote: input.note ?? null, reviewedById: actorId(actor), reviewedAt: new Date() },
    });
    await audit(tx, actor, {
      action: "prescription.review",
      entityType: "prescription",
      entityId: id,
      before: { status: rx.status },
      after: { status: input.decision, valuesTranscribed: Boolean(values) },
    });
    return updated;
  });
}

/**
 * Stream a private prescription file. Allowed for the owning customer, or staff with
 * `prescriptions.read` (audited). Never cached publicly.
 */
export async function readPrescriptionFile(actor: Actor | null, mediaId: string) {
  const asset = await db.mediaAsset.findUnique({ where: { id: mediaId }, include: { prescriptions: { select: { id: true, customerId: true } } } });
  if (!asset || asset.visibility !== "PRIVATE" || asset.purpose !== "prescription") throw notFound("الملف");
  const owner = asset.prescriptions[0]?.customerId;
  if (actor?.kind === "customer") {
    if (actor.customerId !== owner) throw notFound("الملف");
  } else if (actor?.kind === "staff") {
    assertCan(actor, "prescriptions.read");
    await audit(db, actor, { action: "prescription.file_access", entityType: "media_asset", entityId: mediaId, metadata: { prescriptionId: asset.prescriptions[0]?.id } });
  } else {
    throw forbidden();
  }
  const body = await storage().get("PRIVATE", asset.storageKey);
  if (!body) throw notFound("الملف");
  return { body, mimeType: asset.mimeType, name: asset.originalName ?? "prescription" };
}
