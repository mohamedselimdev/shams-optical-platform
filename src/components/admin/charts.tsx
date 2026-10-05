"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useT } from "@/i18n/client";

// Recharts draws its tooltip with inline white styles; use the theme tokens so it follows dark mode.
const tooltip = {
  contentStyle: { background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8, color: "var(--color-ink)" },
  labelStyle: { color: "var(--color-ink-muted)" },
  itemStyle: { color: "var(--color-ink)" },
  cursor: { stroke: "var(--color-line-strong)", fill: "var(--color-surface-2)" },
};

export function SalesTrendChart({ data }: { data: { day: string; net: number; orders: number }[] }) {
  const t = useT();
  if (!data.length) return <p className="py-16 text-center text-sm text-ink-muted">{t("لا توجد مبيعات في هذه الفترة")}</p>;
  return (
    <div className="h-72" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="net" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={11} stroke="var(--color-ink-muted)" />
          <YAxis tickFormatter={(v: number) => t.number(Math.round(v / 100))} fontSize={11} stroke="var(--color-ink-muted)" width={64} />
          <Tooltip {...tooltip} formatter={(v) => t.money(Number(v))} labelFormatter={(l) => String(l)} />
          <Area type="monotone" dataKey="net" name={t("صافي المبيعات")} stroke="var(--color-chart-1)" fill="url(#net)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarList({ data, valueKey, labelKey }: { data: Record<string, string | number>[]; valueKey: string; labelKey: string }) {
  const t = useT();
  if (!data.length) return <p className="py-16 text-center text-sm text-ink-muted">{t("لا توجد بيانات")}</p>;
  return (
    <div className="h-72" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" horizontal={false} />
          <XAxis type="number" tickFormatter={(v: number) => t.number(Math.round(v / 100))} fontSize={11} stroke="var(--color-ink-muted)" />
          <YAxis type="category" dataKey={labelKey} width={110} fontSize={11} stroke="var(--color-ink-muted)" orientation={t.dir === "rtl" ? "right" : "left"} />
          <Tooltip {...tooltip} formatter={(v) => t.money(Number(v))} />
          <Bar dataKey={valueKey} fill="var(--color-chart-2)" radius={[4, 4, 4, 4]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
