import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../env";
import { db } from "../db";
import { invalid } from "../errors";
import type { FileVisibility } from "@/generated/prisma/enums";

/**
 * File storage with strict separation between PUBLIC product/marketing media and PRIVATE customer
 * documents (prescriptions). Private files are never served from a public path or bucket; they are
 * streamed only through authorised route handlers that audit access.
 */
export interface StorageDriver {
  put(visibility: FileVisibility, key: string, body: Buffer, contentType: string): Promise<void>;
  get(visibility: FileVisibility, key: string): Promise<Buffer | null>;
  publicUrl(key: string): string;
}

class LocalDriver implements StorageDriver {
  private root = path.resolve(env.STORAGE_LOCAL_DIR);
  private resolve(visibility: FileVisibility, key: string) {
    const base = path.join(this.root, visibility === "PUBLIC" ? "public" : "private");
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw invalid("مسار ملف غير صالح");
    return full;
  }
  async put(visibility: FileVisibility, key: string, body: Buffer) {
    const full = this.resolve(visibility, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, { flag: "wx" });
  }
  async get(visibility: FileVisibility, key: string) {
    const full = this.resolve(visibility, key);
    try {
      await stat(full);
      return await readFile(full);
    } catch {
      return null;
    }
  }
  publicUrl(key: string) {
    return `/media/${key}`;
  }
}

class S3Driver implements StorageDriver {
  private client = new S3Client({
    region: env.S3_REGION ?? "auto",
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  private bucket(visibility: FileVisibility) {
    return visibility === "PUBLIC" ? env.S3_PUBLIC_BUCKET! : env.S3_PRIVATE_BUCKET!;
  }
  async put(visibility: FileVisibility, key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket(visibility), Key: key, Body: body, ContentType: contentType, ACL: undefined }),
    );
  }
  async get(visibility: FileVisibility, key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(visibility), Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  publicUrl(key: string) {
    return `${env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "")}/${key}`;
  }
}

export function storageConfigured() {
  if (env.STORAGE_DRIVER === "local") return true;
  return Boolean(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_PUBLIC_BUCKET && env.S3_PRIVATE_BUCKET && env.S3_PUBLIC_BASE_URL);
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (driver) return driver;
  driver = env.STORAGE_DRIVER === "s3" && storageConfigured() ? new S3Driver() : new LocalDriver();
  return driver;
}

type Kind = { mime: string; ext: string };
/** Detect type from magic bytes; the client-declared type is never trusted. */
export function sniff(buf: Buffer): Kind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

export const UPLOAD_POLICIES = {
  prescription: { visibility: "PRIVATE" as const, maxBytes: 8 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
  product: { visibility: "PUBLIC" as const, maxBytes: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] },
  banner: { visibility: "PUBLIC" as const, maxBytes: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] },
};
export type UploadPurpose = keyof typeof UPLOAD_POLICIES;

/** Validate and persist an upload, returning the MediaAsset row. Filenames are always generated. */
export async function storeUpload(file: File, purpose: UploadPurpose, uploadedById: string | null) {
  const policy = UPLOAD_POLICIES[purpose];
  if (file.size === 0) throw invalid("الملف فارغ");
  if (file.size > policy.maxBytes) throw invalid(`حجم الملف أكبر من ${Math.round(policy.maxBytes / 1024 / 1024)} ميجابايت`);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind || !policy.mimes.includes(kind.mime)) throw invalid("نوع الملف غير مسموح");
  const now = new Date();
  const key = `${purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${kind.ext}`;
  await storage().put(policy.visibility, key, buf, kind.mime);
  return db.mediaAsset.create({
    data: {
      storageKey: key,
      visibility: policy.visibility,
      mimeType: kind.mime,
      sizeBytes: buf.length,
      checksum: createHash("sha256").update(buf).digest("hex"),
      originalName: file.name.slice(0, 200).replace(/[^\p{L}\p{N}._ -]/gu, "_"),
      purpose,
      uploadedById,
    },
  });
}

export function mediaUrl(asset: { storageKey: string; visibility: FileVisibility }) {
  if (asset.visibility !== "PUBLIC") throw new Error("Private assets have no public URL");
  return storage().publicUrl(asset.storageKey);
}
