import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { type CustomerActor, type StaffActor, can } from "../rbac/actor";
import type { Permission } from "../rbac/permissions";
import { loadCustomerActor, loadStaffActor } from "./load-actor";

export { loadCustomerActor, loadStaffActor };
import { forbidden, unauthenticated } from "../errors";

export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return session;
});

/** Staff actor for the current request, or null. Cached per request. */
export const getStaffActor = cache(async (): Promise<StaffActor | null> => {
  const session = await getSession();
  if (!session) return null;
  return loadStaffActor(session.user.id);
});


export const getCustomerActor = cache(async (): Promise<CustomerActor | null> => {
  const session = await getSession();
  if (!session) return null;
  return loadCustomerActor(session.user.id);
});

/** For dashboard pages: redirects to login when signed out, renders 403 when lacking permission. */
export async function requireStaffPage(permission: Permission = "dashboard.view"): Promise<StaffActor> {
  const actor = await getStaffActor();
  if (!actor) redirect("/admin/login");
  if (!can(actor, permission)) redirect(`/admin/forbidden?p=${encodeURIComponent(permission)}`);
  return actor;
}

/** For server actions / route handlers: throws domain errors instead of redirecting. */
export async function requireStaff(permission: Permission): Promise<StaffActor> {
  const actor = await getStaffActor();
  if (!actor) throw unauthenticated();
  if (!can(actor, permission)) throw forbidden();
  return actor;
}

export async function requireCustomerPage(next = "/account"): Promise<CustomerActor> {
  const actor = await getCustomerActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  return actor;
}

export async function requireCustomer(): Promise<CustomerActor> {
  const actor = await getCustomerActor();
  if (!actor) throw unauthenticated();
  return actor;
}
