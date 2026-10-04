import { forbidden, unauthenticated } from "../errors";
import type { Permission } from "./permissions";

/**
 * The authenticated principal executing a service call. Services receive an Actor
 * rather than reading cookies so the same logic serves the storefront, dashboard, POS and jobs.
 */
export type StaffActor = {
  kind: "staff";
  userId: string;
  staffId: string;
  name: string;
  email: string;
  roleKeys: string[];
  permissions: ReadonlySet<Permission>;
  /** "ALL" or the explicit list of branch ids this staff member may act on. */
  branchIds: "ALL" | readonly string[];
  defaultBranchId: string | null;
};

export type CustomerActor = {
  kind: "customer";
  userId: string;
  customerId: string;
  name: string;
  email: string;
};

export type SystemActor = { kind: "system"; reason: string };

export type Actor = StaffActor | CustomerActor | SystemActor;

export const systemActor = (reason: string): SystemActor => ({ kind: "system", reason });

export function actorId(actor: Actor | null | undefined): string | null {
  if (!actor) return null;
  return actor.kind === "system" ? null : actor.userId;
}

export function can(actor: Actor | null | undefined, permission: Permission, branchId?: string | null): boolean {
  if (!actor) return false;
  if (actor.kind === "system") return true;
  if (actor.kind !== "staff") return false;
  if (!actor.permissions.has(permission)) return false;
  if (branchId) return canAccessBranch(actor, branchId);
  return true;
}

export function canAccessBranch(actor: StaffActor, branchId: string): boolean {
  return actor.branchIds === "ALL" || actor.branchIds.includes(branchId);
}

/** Throws unless the actor holds the permission (and, when given, may act on the branch). */
export function assertCan(
  actor: Actor | null | undefined,
  permission: Permission,
  branchId?: string | null,
): asserts actor is StaffActor | SystemActor {
  if (!actor) throw unauthenticated();
  if (!can(actor, permission, branchId)) throw forbidden();
}

/** Prisma `where` fragment restricting a branch-owned entity to the actor's branches. */
export function branchScope(actor: Actor, field = "branchId"): Record<string, unknown> {
  if (actor.kind !== "staff" || actor.branchIds === "ALL") return {};
  return { [field]: { in: [...actor.branchIds] } };
}
