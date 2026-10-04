"use client";

import { useState } from "react";
import { ADD_RANGE, AXIS_RANGE, CYL_RANGE, MONO_PD_RANGE, PD_RANGE, SPH_RANGE, formatDiopter, formatPd } from "@/lib/optics";
import { useFieldError } from "@/ui/action-form";

export type RxInitial = Partial<Record<"odSph" | "odCyl" | "odAxis" | "odAdd" | "osSph" | "osCyl" | "osAxis" | "osAdd" | "pd" | "pdRight" | "pdLeft", number | null>> & { pdType?: "SINGLE" | "DUAL" };

const cell = "h-9 w-full min-w-20 rounded-md border border-line-strong bg-surface px-1 text-center text-sm num";

function RxSelect({ name, values, fmt, initial, label, prefix }: { name: string; values: number[]; fmt: (v: number) => string; initial?: number | null; label: string; prefix: string }) {
  const err = useFieldError(`${prefix}${name}`);
  return (
    <>
      <select name={`${prefix}${name}`} defaultValue={initial ?? ""} className={cell} aria-label={label} aria-invalid={err ? true : undefined} dir="ltr">
        <option value="">—</option>
        {values.map((v) => <option key={v} value={v}>{fmt(v)}</option>)}
      </select>
      {err ? <span className="col-span-full text-xs text-danger">{err}</span> : null}
    </>
  );
}

/**
 * Prescription grid (OD = right eye, OS = left eye). Values are submitted as integers
 * (hundredths of a diopter, tenths of a mm) and validated again on the server.
 */
export function PrescriptionFields({ initial = {}, prefix = "", showAdd = true }: { initial?: RxInitial; prefix?: string; showAdd?: boolean }) {
  const [pdType, setPdType] = useState<"SINGLE" | "DUAL">(initial.pdType ?? "SINGLE");
  const pdSingleErr = useFieldError(`${prefix}pd`);
  const pdDualErr = useFieldError(`${prefix}pdRight`);
  const pdErr = pdSingleErr ?? pdDualErr;
  const sph0 = SPH_RANGE;
  const axisFmt = (v: number) => String(v);
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm" dir="ltr">
          <thead>
            <tr className="text-xs text-ink-muted">
              <th></th><th>SPH</th><th>CYL</th><th>AXIS</th>{showAdd ? <th>ADD</th> : null}
            </tr>
          </thead>
          <tbody>
            {(["od", "os"] as const).map((eye) => (
              <tr key={eye}>
                <th className="pe-2 text-start text-xs font-medium" dir="rtl">{eye === "od" ? "العين اليمنى (OD)" : "العين اليسرى (OS)"}</th>
                <td><RxSelect prefix={prefix} name={`${eye}Sph`} values={sph0} fmt={formatDiopter} initial={initial[`${eye}Sph`]} label={`SPH ${eye.toUpperCase()}`} /></td>
                <td><RxSelect prefix={prefix} name={`${eye}Cyl`} values={CYL_RANGE} fmt={formatDiopter} initial={initial[`${eye}Cyl`]} label={`CYL ${eye.toUpperCase()}`} /></td>
                <td><RxSelect prefix={prefix} name={`${eye}Axis`} values={AXIS_RANGE} fmt={axisFmt} initial={initial[`${eye}Axis`]} label={`AXIS ${eye.toUpperCase()}`} /></td>
                {showAdd ? <td><RxSelect prefix={prefix} name={`${eye}Add`} values={ADD_RANGE} fmt={formatDiopter} initial={initial[`${eye}Add`]} label={`ADD ${eye.toUpperCase()}`} /></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="mb-1 text-sm font-medium text-ink-soft">المسافة بين الحدقتين (PD)</legend>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" name={`${prefix}pdType`} value="SINGLE" checked={pdType === "SINGLE"} onChange={() => setPdType("SINGLE")} className="accent-ink" /> رقم واحد</label>
          <label className="flex items-center gap-1.5"><input type="radio" name={`${prefix}pdType`} value="DUAL" checked={pdType === "DUAL"} onChange={() => setPdType("DUAL")} className="accent-ink" /> لكل عين</label>
        </div>
        {pdType === "SINGLE" ? (
          <select name={`${prefix}pd`} defaultValue={initial.pd ?? ""} className={`${cell} !w-28`} aria-label="PD" dir="ltr">
            <option value="">—</option>
            {PD_RANGE.map((v) => <option key={v} value={v}>{formatPd(v)}</option>)}
          </select>
        ) : (
          <>
            <select name={`${prefix}pdRight`} defaultValue={initial.pdRight ?? ""} className={`${cell} !w-28`} aria-label="PD يمين" dir="ltr">
              <option value="">يمين</option>
              {MONO_PD_RANGE.map((v) => <option key={v} value={v}>{formatPd(v)}</option>)}
            </select>
            <select name={`${prefix}pdLeft`} defaultValue={initial.pdLeft ?? ""} className={`${cell} !w-28`} aria-label="PD يسار" dir="ltr">
              <option value="">يسار</option>
              {MONO_PD_RANGE.map((v) => <option key={v} value={v}>{formatPd(v)}</option>)}
            </select>
          </>
        )}
        {pdErr ? <p className="w-full text-xs text-danger">{pdErr}</p> : null}
      </fieldset>
    </div>
  );
}
