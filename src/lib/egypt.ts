/** Egyptian governorates. The Arabic name is the stored value and the translation key (display with t(g)). */
export const GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "القليوبية", "الشرقية", "الدقهلية", "الغربية", "المنوفية", "البحيرة",
  "كفر الشيخ", "دمياط", "بورسعيد", "الإسماعيلية", "السويس", "الفيوم", "بني سويف", "المنيا", "أسيوط",
  "سوهاج", "قنا", "الأقصر", "أسوان", "البحر الأحمر", "الوادي الجديد", "مطروح", "شمال سيناء", "جنوب سيناء",
] as const;

export type Governorate = (typeof GOVERNORATES)[number];

export function isGovernorate(v: string): v is Governorate {
  return (GOVERNORATES as readonly string[]).includes(v);
}
