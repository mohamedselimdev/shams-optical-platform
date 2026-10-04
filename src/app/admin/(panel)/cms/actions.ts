"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { requireStaff } from "@/server/auth/session";
import { saveAnnouncement, saveBanner, saveHomeSection, saveNavItem, savePage } from "@/modules/cms/service";
import { cairoLocalToDate } from "@/lib/cairo-time";

type R = ActionResult<unknown> | null;
const optId = (v: unknown) => (typeof v === "string" && v ? v : null);

export async function saveCmsAction(_p: R, form: FormData): Promise<R> {
  return runAction(async () => {
    const actor = await requireStaff("cms.write");
    const { id, entity, ...input } = formToObject(form);
    const kind = z.enum(["banner", "announcement", "nav", "home"]).parse(entity);
    if (kind === "banner") {
      const toIso = (v: unknown) => (v ? cairoLocalToDate(String(v))?.toISOString() ?? "" : "");
      await saveBanner(actor, optId(id), { ...input, startsAt: toIso(input.startsAt), endsAt: toIso(input.endsAt) });
    } else if (kind === "announcement") await saveAnnouncement(actor, optId(id), input);
    else if (kind === "nav") await saveNavItem(actor, optId(id), input);
    else await saveHomeSection(actor, optId(id), input);
    revalidatePath("/admin/cms");
    revalidatePath("/", "layout");
  }, "تم الحفظ");
}

export async function savePageAction(_p: R, form: FormData): Promise<R> {
  let created: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireStaff("cms.write");
    const { id, ...input } = formToObject(form);
    const page = await savePage(actor, optId(id), input);
    if (!optId(id)) created = page.id;
    revalidatePath(`/pages/${page.slug}`);
  }, "تم حفظ الصفحة");
  if (res.ok && created) redirect(`/admin/cms/pages/${created}`);
  return res;
}
