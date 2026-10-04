import { getStaffActor } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { findReport, ORDERS_EXPORT, runOrdersExport } from "@/modules/reports/registry";
import { toCsv, toXlsx } from "@/modules/reports/export";
import { parseRange } from "@/components/admin/range";
import { OrderStatus } from "@/generated/prisma/enums";

/**
 * Report exports. Requires an authenticated staff session with `reports.export` AND the report's
 * own permission; the report services re-check permissions and branch scope. Every export is audited.
 */
export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const actor = await getStaffActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { report: key } = await params;
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const format = sp.format === "xlsx" ? "xlsx" : "csv";
  const def = key === "orders" ? ORDERS_EXPORT : findReport(key);
  if (!def) return new Response("Not found", { status: 404 });
  if (!can(actor, "reports.export") || !can(actor, def.permission)) return new Response("Forbidden", { status: 403 });

  const range = parseRange({ from: sp.from, to: sp.to, branch: sp.branch });
  try {
    const rows =
      key === "orders"
        ? await runOrdersExport(actor, {
            q: sp.q?.slice(0, 80) || undefined,
            status: sp.status && sp.status in OrderStatus ? sp.status : undefined,
            branchId: sp.branch || undefined,
            channel: sp.channel || undefined,
            ...(sp.from || sp.to ? { from: range.from, to: range.to } : {}),
          })
        : await def.run(actor, range);
    await audit(db, actor, { action: "report.export", entityType: "report", entityId: def.key, branchId: range.branchId, metadata: { format, rows: rows.length, from: range.fromStr, to: range.toStr } });
    const name = `shams-${def.key}-${range.fromStr}_${range.toStr}.${format}`;
    const headers = { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (format === "xlsx") {
      const buf = await toXlsx(def.title, def.columns, rows);
      return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    }
    return new Response(toCsv(def.columns, rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    throw e;
  }
}
