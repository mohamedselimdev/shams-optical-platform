import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "../db";
import { type CustomerActor, type StaffActor, can } from "../rbac/actor";
import { type Permission, isPermission } from "../rbac/permissions";
import { forbidden, unauthenticated } from "../errors";

export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return session;
});

export async function loadStaffActor(userId: string): Promise<StaffActor | null> {
  const staff = await db.staffProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, email: true, status: true } },
      roles: { include: { role: { include: { permissions: true } } } },
      branches: { select: { branchId: true } },
    },
  });
  if (!staff || !staff.isActive || staff.user.status !== "ACTIVE") return null;
  const permissions = new Set<Permission>();
  for (const { role } of staff.roles) {
    for (const p of role.permissions) if (isPermission(p.permission)) permissions.add(p.permission);
  }
  return {
    kind: "staff",
    userId,
    staffId: staff.id,
    name: staff.user.name,
    email: staff.user.email,
    roleKeys: staff.roles.map((r) => r.role.key),
    permissions,
    branchIds: staff.allBranches ? "ALL" : staff.branches.map((b) => b.branchId),
    defaultBranchId: staff.defaultBranchId,
  };
}

/** Staff actor for the current request, or null. Cached per request. */
export const getStaffActor = cache(async (): Promise<StaffActor | null> => {
  const session = await getSession();
  if (!session) return null;
  return loadStaffActor(session.user.id);
});

export async function loadCustomerActor(userId: string): Promise<CustomerActor | null> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { customer: true } });
  if (!user || user.status !== "ACTIVE") return null;
  let customer = user.customer;
  if (!customer) {
    // Every authenticated shopper gets a customer profile on first use.
    const [firstName, ...rest] = user.name.trim().split(/\s+/);
    customer = await db.customer.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, firstName: firstName || user.name, lastName: rest.join(" ") || null, email: user.email, phone: user.phone },
    });
  }
  return { kind: "customer", userId, customerId: customer.id, name: user.name, email: user.email };
}

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
