import ExcelJS from "exceljs";
import type { Column } from "./registry";

type Row = Record<string, string | number | Date | null>;

/** Neutralise spreadsheet formula injection (cells starting with = + - @ tab or CR). */
export function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function cellValue(col: Column, v: Row[string]): string | number {
  if (v === null || v === undefined) return "";
  if (col.type === "money") return Number(v) / 100;
  if (col.type === "percent") return Math.round(Number(v) * 10000) / 100;
  if (col.type === "number") return Number(v);
  if (col.type === "date") return v instanceof Date ? v.toISOString() : String(v);
  return safeCell(String(v));
}

function header(col: Column) {
  return col.type === "money" ? `${col.label} (ج.م)` : col.type === "percent" ? `${col.label} (%)` : col.label;
}

export function toCsv(columns: Column[], rows: Row[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(safeCell(header(c)))).join(",")];
  for (const r of rows) lines.push(columns.map((c) => esc(cellValue(c, r[c.key]))).join(","));
  // BOM so Excel opens Arabic text as UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function toXlsx(title: string, columns: Column[], rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SHAMS";
  const ws = wb.addWorksheet(title.slice(0, 31), { views: [{ rightToLeft: true }] });
  ws.columns = columns.map((c) => ({ header: header(c), key: c.key, width: Math.max(12, c.label.length + 6), style: c.type === "money" ? { numFmt: "#,##0.00" } : undefined }));
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, cellValue(c, r[c.key])])));
  ws.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
