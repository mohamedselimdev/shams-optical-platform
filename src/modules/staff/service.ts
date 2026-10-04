import "server-only";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type StaffActor, assertCan } from "@/server/rbac/actor";
import { ALL_PERMISSIONS, type Permission, isPermission } from "@/server/rbac/permissions";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { zCheckbox, zEmail, zText } from "@/lib/validation";

const isOwner = (actor: StaffActor) => actor.roleKeys.includes("owner");

/**
 * Prevent privilege escalation: a non-owner may only grant permissions they already hold
 * and may never assign or edit the owner role.
 */
function assertCanGrant(actor: StaffActor, permissions: Iterable<string>) {
  if (isOwner(actor)) return;
  for (const p of permissions) {
    if (!isPermission(p) || !actor.permissions.has(p)) throw forbidden("لا يمكنك منح صلاحية لا تملكها");
  }
}

export const staffSchema = z.object({
  name: zText(120),
  email: zEmail,
  phone: z.string().trim().max(30).optional(),
  employeeCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "كود الموظف غير صالح"),
  jobTitle: z.string().trim().max(80).optional(),
  password: z.string().min(10, "كلمة المرور 10 أحرف على الأقل").max(128).optional().or(z.literal("")),
  roleIds: z.array(z.string()).min(1, "اختر دوراً واحداً على الأقل"),
  branchIds: z.array(z.string()).default([]),
  allBranches: zCheckbox,
  defaultBranchId: z.string().optional().transform((v) => v || null),
  isActive: zCheckbox,
});

async function rolesForGrant(actor: StaffActor, roleIds: string[]) {
  const roles = await db.role.findMany({ where: { id: { in: roleIds } }, include: { permissions: true } });
  if (roles.length !== roleIds.length) throw invalid("دور غير موجود");
  if (!isOwner(actor) && roles.some((r) => r.key === "owner")) throw forbidden("فقط المالك يمكنه تعيين دور المالك");
  assertCanGrant(actor, roles.flatMap((r) => r.permissions.map((p) => p.permission)));
  return roles;
}

export async function createStaff(actor: StaffActor, input: unknown) {
  assertCan(actor, "staff.write");
  const data = staffSchema.parse(input);
  if (!data.password) throw invalid("كلمة المرور مطلوبة للموظف الجديد");
  if (data.allBranches && actor.branchIds !== "ALL") throw forbidden("لا يمكنك منح صلاحية كل الفروع");
  if (actor.branchIds !== "ALL" && data.branchIds.some((b) => !actor.branchIds.includes(b))) throw forbidden();
  await rolesForGrant(actor, data.roleIds);
  const passwordHash = await hashPassword(data.password);

  return db.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email: data.email } })) throw conflict("البريد الإلكتروني مستخدم بالفعل");
    if (await tx.staffProfile.findUnique({ where: { employeeCode: data.employeeCode } })) throw conflict("كود الموظف مستخدم بالفعل");
    const userId = crypto.randomUUID();
    await tx.user.create({ data: { id: userId, name: data.name, email: data.email, phone: data.phone || null, emailVerified: true, kind: "STAFF" } });
    await tx.account.create({ data: { id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: passwordHash } });
    const staff = await tx.staffProfile.create({
      data: {
        userId,
        employeeCode: data.employeeCode,
        jobTitle: data.jobTitle || null,
        allBranches: data.allBranches,
        defaultBranchId: data.defaultBranchId,
        isActive: true,
        roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
        branches: { create: data.branchIds.map((branchId) => ({ branchId })) },
      },
    });
    await audit(tx, actor, { action: "staff.create", entityType: "staff", entityId: staff.id, after: { email: data.email, roles: data.roleIds, branches: data.branchIds, allBranches: data.allBranches } });
    return staff;
  });
}

export async function updateStaff(actor: StaffActor, staffId: string, input: unknown) {
  assertCan(actor, "staff.write");
  const data = staffSchema.parse(input);
  const existing = await db.staffProfile.findUnique({ where: { id: staffId }, include: { roles: { include: { role: true } }, branches: true, user: true } });
  if (!existing) throw notFound("الموظف");
  if (!isOwner(actor) && existing.roles.some((r) => r.role.key === "owner")) throw forbidden("لا يمكن تعديل حساب المالك");
  if (existing.userId === actor.userId && !data.isActive) throw invalid("لا يمكنك تعطيل حسابك");
  if (data.allBranches && actor.branchIds !== "ALL") throw forbidden("لا يمكنك منح صلاحية كل الفروع");
  if (actor.branchIds !== "ALL" && data.branchIds.some((b) => !actor.branchIds.includes(b))) throw forbidden();
  await rolesForGrant(actor, data.roleIds);
  const passwordHash = data.password ? await hashPassword(data.password) : null;

  return db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: existing.userId }, data: { name: data.name, phone: data.phone || null, status: data.isActive ? "ACTIVE" : "SUSPENDED" } });
    if (passwordHash) {
      await tx.account.updateMany({ where: { userId: existing.userId, providerId: "credential" }, data: { password: passwordHash } });
      await tx.session.deleteMany({ where: { userId: existing.userId } });
    }
    if (!data.isActive) await tx.session.deleteMany({ where: { userId: existing.userId } });
    await tx.staffRole.deleteMany({ where: { staffId } });
    await tx.staffBranch.deleteMany({ where: { staffId } });
    await tx.staffProfile.update({
      where: { id: staffId },
      data: {
        jobTitle: data.jobTitle || null,
        allBranches: data.allBranches,
        defaultBranchId: data.defaultBranchId,
        isActive: data.isActive,
        roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
        branches: { create: data.branchIds.map((branchId) => ({ branchId })) },
      },
    });
    await audit(tx, actor, {
      action: "staff.roles",
      entityType: "staff",
      entityId: staffId,
      before: { roles: existing.roles.map((r) => r.role.key), branches: existing.branches.map((b) => b.branchId), allBranches: existing.allBranches, active: existing.isActive },
      after: { roles: data.roleIds, branches: data.branchIds, allBranches: data.allBranches, active: data.isActive, passwordReset: Boolean(passwordHash) },
    });
  });
}

export const roleSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,40}$/, "مفتاح الدور غير صالح"),
  name: zText(80),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string()).transform((list) => list.filter(isPermission) as Permission[]),
});

export async function saveRole(actor: StaffActor, id: string | null, input: unknown) {
  assertCan(actor, "roles.write");
  const data = roleSchema.parse(input);
  assertCanGrant(actor, data.permissions);
  return db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.role.findUnique({ where: { id }, include: { permissions: true } });
      if (!before) throw notFound("الدور");
      if (before.key === "owner") throw forbidden("لا يمكن تعديل دور المالك");
      if (before.isSystem && before.key !== data.key) throw invalid("لا يمكن تغيير مفتاح دور النظام");
      // A non-owner must also hold every permission being removed, otherwise they could strip others' rights they cannot see.
      assertCanGrant(actor, before.permissions.map((p) => p.permission));
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      const after = await tx.role.update({
        where: { id },
        data: { name: data.name, description: data.description ?? null, permissions: { create: data.permissions.map((permission) => ({ permission })) } },
      });
      await audit(tx, actor, { action: "role.update", entityType: "role", entityId: id, before: { permissions: before.permissions.map((p) => p.permission) }, after: { permissions: data.permissions } });
      return after;
    }
    if (await tx.role.findUnique({ where: { key: data.key } })) throw conflict("مفتاح الدور مستخدم");
    const created = await tx.role.create({
      data: { key: data.key, name: data.name, description: data.description ?? null, permissions: { create: data.permissions.map((permission) => ({ permission })) } },
    });
    await audit(tx, actor, { action: "role.create", entityType: "role", entityId: created.id, after: { key: data.key, permissions: data.permissions } });
    return created;
  });
}

export const allPermissionKeys = ALL_PERMISSIONS;
