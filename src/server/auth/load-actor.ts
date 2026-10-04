import "server-only";
import { db } from "../db";
import type { CustomerActor, StaffActor } from "../rbac/actor";
import { type Permission, isPermission } from "../rbac/permissions";

/** Build actors from the database (no request context; usable from scripts and workers). */
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
