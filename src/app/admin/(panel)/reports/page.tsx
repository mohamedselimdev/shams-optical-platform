import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { REPORTS, findReport } from "@/modules/reports/registry";
import { PageHeader } from "@/components/admin/page-header";
import { RangeFilter } from "@/components/admin/range-filter";
import { actorBranches, parseRange } from "@/components/admin/range";
import { Card, CardHeader, EmptyState, Money, Table, Td, Th, DateText } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";
import { cn } from "@/ui/cn";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("التقارير") };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string; branch?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("reports.read");
  const sp = await searchParams;
  const available = REPORTS.filter((r) => can(actor, r.permission));
  const def = (sp.r && findReport(sp.r)) || available[0];
  const allowed = def && can(actor, def.permission);
  const branches = await actorBranches(actor);
  const range = parseRange({ ...sp, branch: branches.some((b) => b.id === sp.branch) ? sp.branch : undefined });
  const rows = allowed ? await def.run(actor, range) : [];
  const qs = new URLSearchParams({ from: range.fromStr, to: range.toStr, ...(range.branchId ? { branch: range.branchId } : {}) });
  return (
    <>
      <PageHeader title={t("التقارير")} description={t("كل الأرقام محسوبة من الطلبات والدفتر المحاسبي؛ المبالغ بالجنيه المصري.")} />
      <div className="grid gap-6 lg:grid-cols-4">
        <nav className="space-y-1" aria-label={t("التقارير")}>
          {available.map((r) => (
            <Link key={r.key} href={`/admin/reports?r=${r.key}&${qs}`} aria-current={r.key === def?.key ? "page" : undefined} className={cn("block rounded-md px-3 py-2 text-sm", r.key === def?.key ? "bg-ink text-surface" : "hover:bg-surface-2")}>{t(r.title)}</Link>
          ))}
        </nav>
        <div className="lg:col-span-3">
          {def && allowed ? (
            <Card>
              <CardHeader
                title={t(def.title)}
                description={def.description ? t(def.description) : undefined}
                actions={can(actor, "reports.export") ? (
                  <div className="flex gap-2">
                    <a className={buttonClass("secondary", "sm")} href={`/admin/export/${def.key}?${qs}&format=csv`}>CSV</a>
                    <a className={buttonClass("secondary", "sm")} href={`/admin/export/${def.key}?${qs}&format=xlsx`}>Excel</a>
                  </div>
                ) : null}
              />
              <div className="border-b border-line p-4">
                <RangeFilter fromStr={range.fromStr} toStr={range.toStr} branchId={range.branchId} branches={branches} extra={{ r: def.key }} />
                {!def.usesRange ? <p className="mt-2 text-xs text-ink-muted">{t("هذا التقرير لحظي ولا يتأثر بالفترة.")}</p> : null}
              </div>
              {rows.length ? (
                <Table>
                  <thead><tr>{def.columns.map((c) => <Th key={c.key}>{t(c.label)}</Th>)}</tr></thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        {def.columns.map((c) => {
                          const v = row[c.key];
                          return <Td key={c.key}>{v === null || v === undefined ? "—" : c.type === "money" ? <Money value={Number(v)} /> : c.type === "number" ? <span className="num">{t.number(Number(v))}</span> : c.type === "percent" ? t.percent(Number(v)) : c.type === "date" ? <DateText value={v as Date} /> : t(String(v))}</Td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : <EmptyState title={t("لا توجد بيانات لهذه الفترة")} />}
            </Card>
          ) : <EmptyState title={t("لا توجد تقارير متاحة لصلاحياتك")} />}
        </div>
      </div>
    </>
  );
}
