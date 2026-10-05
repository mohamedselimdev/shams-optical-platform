import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, assertCan } from "@/server/rbac/actor";
import { conflict } from "@/server/errors";
import { zCheckbox, zSafePath, zSlug, zText } from "@/lib/validation";
import { parseBlocks, type Block } from "./blocks";
import { Prisma } from "@/generated/prisma/client";
import { getLocaleOrDefault } from "@/i18n/server";
import { localizeContent } from "@/i18n/localize";

export const pageSchema = z.object({
  slug: zSlug,
  title: zText(160),
  titleEn: z.string().trim().max(160).optional().transform((v) => v || null),
  source: z.string().max(50_000),
  sourceEn: z.string().max(50_000).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  seoTitle: z.string().trim().max(160).optional().transform((v) => v || null),
  seoDescription: z.string().trim().max(320).optional().transform((v) => v || null),
  showInFooter: zCheckbox,
});

export async function savePage(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "cms.write");
  const { source, sourceEn, ...data } = pageSchema.parse(input);
  const blocks = parseBlocks(source);
  const blocksEn = sourceEn?.trim() ? parseBlocks(sourceEn) : Prisma.DbNull;
  const dup = await db.contentPage.findFirst({ where: { slug: data.slug, ...(id ? { NOT: { id } } : {}) } });
  if (dup) throw conflict("الرابط مستخدم");
  const payload = { ...data, blocks, blocksEn, updatedById: actor.kind === "staff" ? actor.userId : null };
  const page = id ? await db.contentPage.update({ where: { id }, data: payload }) : await db.contentPage.create({ data: payload });
  await audit(db, actor, { action: "cms.update", entityType: "content_page", entityId: page.id, after: { slug: data.slug, status: data.status } });
  return page;
}

export async function getPublishedPage(slug: string) {
  const page = await db.contentPage.findFirst({ where: { slug, status: "PUBLISHED" } });
  if (!page) return null;
  const localized = localizeContent(page, await getLocaleOrDefault());
  return { ...localized, blocks: localized.blocks as Block[] };
}

const optionalHref = z.union([z.literal(""), zSafePath]).optional().transform((v) => v || null);

export const bannerSchema = z.object({
  placement: z.enum(["HOME_HERO", "HOME_PROMO", "CATALOG_TOP"]),
  title: zText(120),
  titleEn: z.string().trim().max(120).optional().transform((v) => v || null),
  subtitle: z.string().trim().max(240).optional().transform((v) => v || null),
  subtitleEn: z.string().trim().max(240).optional().transform((v) => v || null),
  ctaLabel: z.string().trim().max(40).optional().transform((v) => v || null),
  ctaLabelEn: z.string().trim().max(40).optional().transform((v) => v || null),
  ctaHref: optionalHref,
  imageUrl: z.string().trim().max(500).optional().transform((v) => v || null).refine((u) => u === null || (u.startsWith("/") && !u.startsWith("//")) || u.startsWith("https://"), "رابط الصورة يجب أن يبدأ بـ / أو https://"),
  startsAt: z.union([z.literal(""), z.coerce.date()]).optional().transform((v) => (v ? v : null)),
  endsAt: z.union([z.literal(""), z.coerce.date()]).optional().transform((v) => (v ? v : null)),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: zCheckbox,
});

export async function saveBanner(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "cms.write");
  const data = bannerSchema.parse(input);
  const banner = id ? await db.banner.update({ where: { id }, data }) : await db.banner.create({ data });
  await audit(db, actor, { action: "cms.update", entityType: "banner", entityId: banner.id, after: data });
  return banner;
}

export const announcementSchema = z.object({
  message: zText(200),
  messageEn: z.string().trim().max(200).optional().transform((v) => v || null),
  href: optionalHref,
  isActive: zCheckbox,
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function saveAnnouncement(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "cms.write");
  const data = announcementSchema.parse(input);
  const row = id ? await db.announcement.update({ where: { id }, data }) : await db.announcement.create({ data });
  await audit(db, actor, { action: "cms.update", entityType: "announcement", entityId: row.id, after: data });
  return row;
}

export const navSchema = z.object({
  menu: z.enum(["HEADER", "FOOTER"]),
  label: zText(60),
  labelEn: z.string().trim().max(60).optional().transform((v) => v || null),
  href: zSafePath,
  parentId: z.string().optional().transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: zCheckbox,
});

export async function saveNavItem(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "cms.write");
  const data = navSchema.parse(input);
  const row = id ? await db.navigationItem.update({ where: { id }, data }) : await db.navigationItem.create({ data });
  await audit(db, actor, { action: "cms.update", entityType: "navigation_item", entityId: row.id, after: data });
  return row;
}

export const homeSectionSchema = z.object({
  type: z.enum(["FEATURED_PRODUCTS", "COLLECTION", "CATEGORIES", "BRANDS", "NEW_ARRIVALS", "BEST_SELLERS"]),
  title: zText(120),
  titleEn: z.string().trim().max(120).optional().transform((v) => v || null),
  collectionSlug: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(2).max(24).default(8),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: zCheckbox,
});

export async function saveHomeSection(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "cms.write");
  const { type, title, titleEn, sortOrder, isActive, ...config } = homeSectionSchema.parse(input);
  const data = { type, title, titleEn, sortOrder, isActive, config };
  const row = id ? await db.homeSection.update({ where: { id }, data }) : await db.homeSection.create({ data });
  await audit(db, actor, { action: "cms.update", entityType: "home_section", entityId: row.id, after: data });
  return row;
}

/** Everything the storefront shell needs, filtered by schedule. */
export async function storefrontContent() {
  const now = new Date();
  const scheduled = { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] };
  const [announcements, header, footer, footerPages] = await Promise.all([
    db.announcement.findMany({ where: scheduled, orderBy: { sortOrder: "asc" } }),
    db.navigationItem.findMany({ where: { menu: "HEADER", isActive: true, parentId: null }, orderBy: { sortOrder: "asc" }, include: { children: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } }),
    db.navigationItem.findMany({ where: { menu: "FOOTER", isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.contentPage.findMany({ where: { status: "PUBLISHED", showInFooter: true }, select: { slug: true, title: true, titleEn: true } }),
  ]);
  return localizeContent({ announcements, header, footer, footerPages }, await getLocaleOrDefault());
}

export async function activeBanners(placement: string) {
  const now = new Date();
  const rows = await db.banner.findMany({
    where: { placement, isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
    orderBy: { sortOrder: "asc" },
  });
  return localizeContent(rows, await getLocaleOrDefault());
}
