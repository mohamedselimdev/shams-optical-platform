"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { signInWithPassword, signOut } from "@/server/auth/login";
import { safeRedirectPath } from "@/lib/validation";

const schema = z.object({ email: z.string().trim().email("بريد إلكتروني غير صالح"), password: z.string().min(1, "كلمة المرور مطلوبة") });

export async function staffSignIn(_prev: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const result = await runAction(async () => {
    const data = schema.parse({ email: form.get("email"), password: form.get("password") });
    await signInWithPassword(data.email, data.password, "staff");
  });
  if (result.ok) redirect(safeRedirectPath(String(form.get("next") ?? ""), "/admin"));
  return result;
}

export async function staffSignOut() {
  await signOut();
  redirect("/admin/login");
}
