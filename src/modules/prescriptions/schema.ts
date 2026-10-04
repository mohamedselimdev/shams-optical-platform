import { z } from "zod";

/** Values arrive as hundredths of a diopter / tenths of a mm (the UI converts). */
const sph = z.coerce.number().int().min(-2000).max(1200).refine((v) => v % 25 === 0, "قيم SPH بخطوات 0.25");
const cyl = z.coerce.number().int().min(-600).max(600).refine((v) => v % 25 === 0, "قيم CYL بخطوات 0.25");
const add = z.coerce.number().int().min(50).max(400).refine((v) => v % 25 === 0, "قيم ADD بخطوات 0.25");
const axis = z.coerce.number().int().min(0).max(180);
const prism = z.coerce.number().int().min(0).max(1000);

const opt = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === "" || v === undefined || v === null ? null : v), s.nullable());

export const prescriptionValuesSchema = z
  .object({
    odSph: opt(sph),
    odCyl: opt(cyl),
    odAxis: opt(axis),
    odAdd: opt(add),
    odPrism: opt(prism),
    odBase: opt(z.enum(["UP", "DOWN", "IN", "OUT"])),
    osSph: opt(sph),
    osCyl: opt(cyl),
    osAxis: opt(axis),
    osAdd: opt(add),
    osPrism: opt(prism),
    osBase: opt(z.enum(["UP", "DOWN", "IN", "OUT"])),
    pdType: z.enum(["SINGLE", "DUAL"]).default("SINGLE"),
    pd: opt(z.coerce.number().int().min(500).max(800)),
    pdRight: opt(z.coerce.number().int().min(250).max(400)),
    pdLeft: opt(z.coerce.number().int().min(250).max(400)),
  })
  .superRefine((v, ctx) => {
    if (v.odSph === null && v.osSph === null) ctx.addIssue({ code: "custom", path: ["odSph"], message: "أدخل قيمة SPH لعين واحدة على الأقل" });
    for (const eye of ["od", "os"] as const) {
      const c = v[`${eye}Cyl`];
      const a = v[`${eye}Axis`];
      if (c !== null && c !== 0 && a === null) ctx.addIssue({ code: "custom", path: [`${eye}Axis`], message: "AXIS مطلوب عند وجود CYL" });
      if ((c === null || c === 0) && a !== null && a !== 0) ctx.addIssue({ code: "custom", path: [`${eye}Axis`], message: "AXIS بدون CYL غير صالح" });
      if (v[`${eye}Prism`] && !v[`${eye}Base`]) ctx.addIssue({ code: "custom", path: [`${eye}Base`], message: "حدد اتجاه البريزم" });
    }
    if (v.pdType === "SINGLE" && v.pd === null) ctx.addIssue({ code: "custom", path: ["pd"], message: "المسافة بين الحدقتين مطلوبة" });
    if (v.pdType === "DUAL" && (v.pdRight === null || v.pdLeft === null)) ctx.addIssue({ code: "custom", path: ["pdRight"], message: "أدخل المسافة لكل عين" });
  });

export type PrescriptionValues = z.infer<typeof prescriptionValuesSchema>;

export const prescriptionMetaSchema = z.object({
  label: z.string().trim().min(1, "اسم الوصفة مطلوب").max(80),
  doctorName: z.preprocess((v) => (v ? v : null), z.string().trim().max(120).nullable()),
  examDate: z.preprocess((v) => (v ? v : null), z.coerce.date().nullable()),
  notes: z.preprocess((v) => (v ? v : null), z.string().trim().max(500).nullable()),
});

export function hasAdd(v: Pick<PrescriptionValues, "odAdd" | "osAdd">) {
  return (v.odAdd ?? 0) > 0 || (v.osAdd ?? 0) > 0;
}

/** Strongest absolute sphere and cylinder across both eyes — used for lens index suitability. */
export function powerEnvelope(v: Pick<PrescriptionValues, "odSph" | "osSph" | "odCyl" | "osCyl">) {
  const sphs = [v.odSph, v.osSph].filter((x): x is number => x !== null);
  const cyls = [v.odCyl, v.osCyl].filter((x): x is number => x !== null).map(Math.abs);
  return { minSph: Math.min(...sphs, 0), maxSph: Math.max(...sphs, 0), maxCyl: Math.max(...cyls, 0) };
}
