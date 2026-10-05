"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ActionForm, type FormAction } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { PrescriptionFields } from "@/components/rx/prescription-fields";
import { formatMoney } from "@/lib/money";
import { cn } from "@/ui/cn";
import { track } from "./analytics";

export type PurchaseVariant = {
  id: string;
  sku: string;
  colorName: string | null;
  colorHex: string | null;
  sizeLabel: string | null;
  price: number;
  effectivePrice: number;
  available: number;
  lensWidthMm: number | null;
  bridgeMm: number | null;
  templeMm: number | null;
};

export type LensCatalogView = {
  types: { id: string; name: string; description: string | null; requiresPrescription: boolean; requiresAdd: boolean }[];
  indexes: { id: string; name: string; description: string | null }[];
  prices: { lensTypeId: string; lensIndexId: string; price: number }[];
  options: { id: string; name: string; description: string | null; group: string; price: number; exclusive: boolean; lensTypeIds: string[] }[];
  groupLabels: Record<string, string>;
};

type Props = {
  productId: string;
  variants: PurchaseVariant[];
  lens: LensCatalogView | null;
  savedRx: { id: string; label: string; status: string }[] | null;
  signedIn: boolean;
  maxQty: number;
  branches: { id: string; name: string }[];
  availability: { variantId: string; branchId: string; level: "none" | "low" | "ok" }[];
  addAction: FormAction;
  loginHref: string;
};

const LEVEL = { none: "غير متوفر", low: "كمية محدودة", ok: "متوفر" } as const;

/**
 * Variant selection, optional lens configuration and add-to-cart. Prices shown here are a preview;
 * the server re-prices everything from the database when the item is added and again at checkout.
 */
export function ProductPurchase({ productId, variants, lens, savedRx, signedIn, maxQty, branches, availability, addAction, loginHref }: Props) {
  const [variantId, setVariantId] = useState(() => (variants.find((v) => v.available > 0) ?? variants[0]).id);
  const [withLens, setWithLens] = useState(false);
  const [typeId, setTypeId] = useState(lens?.types[0]?.id ?? "");
  const [indexId, setIndexId] = useState("");
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [rxSource, setRxSource] = useState<"SAVED" | "ENTERED" | "UPLOADED">(savedRx?.length ? "SAVED" : "ENTERED");
  const variant = variants.find((v) => v.id === variantId)!;
  const type = lens?.types.find((candidate) => candidate.id === typeId) ?? null;

  const indexPrices = useMemo(() => new Map((lens?.prices ?? []).filter((p) => p.lensTypeId === typeId).map((p) => [p.lensIndexId, p.price])), [lens, typeId]);
  const effectiveIndexId = indexPrices.has(indexId) ? indexId : (lens?.indexes.find((i) => indexPrices.has(i.id))?.id ?? "");
  const compatibleOptions = (lens?.options ?? []).filter((o) => !o.lensTypeIds.length || o.lensTypeIds.includes(typeId));
  const chosenOptions = compatibleOptions.filter((o) => optionIds.includes(o.id));
  const lensPrice = withLens && type ? (indexPrices.get(effectiveIndexId) ?? 0) + chosenOptions.reduce((s, o) => s + o.price, 0) : 0;
  const groups = [...new Set(compatibleOptions.map((o) => o.group))];

  const toggleOption = (id: string, group: string, exclusive: boolean) =>
    setOptionIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const sameGroup = exclusive ? compatibleOptions.filter((o) => o.group === group).map((o) => o.id) : [];
      return [...cur.filter((x) => !sameGroup.includes(x)), id];
    });

  const needsRx = withLens && type?.requiresPrescription;
  const outOfStock = variant.available <= 0;

  return (
    <ActionForm action={addAction} className="space-y-6">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId} />

      <div className="flex items-baseline gap-3">
        <span className="num font-display text-3xl font-semibold">{formatMoney(variant.effectivePrice + lensPrice)}</span>
        {variant.price > variant.effectivePrice ? <span className="num text-ink-faint line-through">{formatMoney(variant.price + lensPrice)}</span> : null}
        {lensPrice ? <span className="text-sm text-ink-muted">شامل العدسات</span> : null}
      </div>

      {variants.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">اللون والمقاس: <span className="text-ink-muted">{[variant.colorName, variant.sizeLabel].filter(Boolean).join(" / ")}</span></legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                aria-pressed={v.id === variantId}
                className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition", v.id === variantId ? "border-ink bg-ink text-surface" : "border-line-strong hover:border-ink", v.available <= 0 && "opacity-50")}
              >
                {v.colorHex ? <span className="h-4 w-4 rounded-full ring-1 ring-line" style={{ backgroundColor: v.colorHex }} aria-hidden /> : null}
                {[v.colorName, v.sizeLabel].filter(Boolean).join(" / ") || v.sku}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}


      {lens && lens.types.length ? (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">العدسات</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className={cn("cursor-pointer rounded-lg border p-3 text-sm", !withLens ? "border-ink ring-1 ring-ink" : "border-line-strong")}>
              <input type="radio" name="withLens" value="0" checked={!withLens} onChange={() => setWithLens(false)} className="sr-only" />
              <span className="font-medium">الإطار فقط</span>
              <span className="block text-ink-muted">بدون عدسات طبية</span>
            </label>
            <label className={cn("cursor-pointer rounded-lg border p-3 text-sm", withLens ? "border-ink ring-1 ring-ink" : "border-line-strong")}>
              <input type="radio" name="withLens" value="1" checked={withLens} onChange={() => { setWithLens(true); track({ name: "lens_configured", productId }); }} className="sr-only" />
              <span className="font-medium">مع عدسات</span>
              <span className="block text-ink-muted">طبية أو بدون مقاس</span>
            </label>
          </div>

          {withLens ? (
            <div className="space-y-5 rounded-lg border border-line bg-surface p-4">
              <div>
                <p className="mb-2 text-sm font-medium">١. نوع العدسة</p>
                <div className="space-y-2">
                  {lens.types.map((lensType) => (
                    <label key={lensType.id} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm", lensType.id === typeId ? "border-ink bg-surface-2" : "border-line")}>
                      <input type="radio" name="lensTypeId" value={lensType.id} checked={lensType.id === typeId} onChange={() => { setTypeId(lensType.id); setOptionIds([]); }} className="mt-1 accent-ink" />
                      <span><span className="font-medium">{lensType.name}</span>{lensType.description ? <span className="block text-ink-muted">{lensType.description}</span> : null}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">٢. سُمك العدسة (معامل الانكسار)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {lens.indexes.filter((i) => indexPrices.has(i.id)).map((i) => (
                    <label key={i.id} className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-md border p-3 text-sm", i.id === effectiveIndexId ? "border-ink bg-surface-2" : "border-line")}>
                      <span className="flex items-center gap-2"><input type="radio" name="lensIndexId" value={i.id} checked={i.id === effectiveIndexId} onChange={() => setIndexId(i.id)} className="accent-ink" />{i.name}</span>
                      <span className="num text-ink-muted">{formatMoney(indexPrices.get(i.id)!)}</span>
                    </label>
                  ))}
                </div>
              </div>
              {groups.length ? (
                <div>
                  <p className="mb-2 text-sm font-medium">٣. إضافات (اختياري)</p>
                  <div className="space-y-3">
                    {groups.map((g) => (
                      <div key={g}>
                        <p className="mb-1 text-xs text-ink-muted">{lens.groupLabels[g] ?? g}</p>
                        <div className="flex flex-wrap gap-2">
                          {compatibleOptions.filter((o) => o.group === g).map((o) => (
                            <label key={o.id} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm", optionIds.includes(o.id) ? "border-ink bg-ink text-surface" : "border-line-strong")}>
                              <input type="checkbox" name="lensOptionIds[]" value={o.id} checked={optionIds.includes(o.id)} onChange={() => toggleOption(o.id, o.group, o.exclusive)} className="sr-only" />
                              {o.name} <span className="num opacity-75">+{formatMoney(o.price)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {needsRx ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">٤. الوصفة الطبية</p>
                  {!signedIn ? (
                    <p className="rounded-md bg-info-soft p-3 text-sm text-info">
                      لحماية بياناتك الطبية نحفظ الوصفات في حسابك فقط. <Link href={loginHref} className="font-medium underline">سجّل الدخول أو أنشئ حساباً</Link> لإكمال طلب العدسات الطبية.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2 text-sm">
                        {savedRx?.length ? <RxTab value="SAVED" current={rxSource} onChange={setRxSource}>وصفة محفوظة</RxTab> : null}
                        <RxTab value="ENTERED" current={rxSource} onChange={setRxSource}>إدخال القيم</RxTab>
                        <RxTab value="UPLOADED" current={rxSource} onChange={setRxSource}>رفع صورة الوصفة</RxTab>
                      </div>
                      <input type="hidden" name="rxSource" value={rxSource} />
                      {rxSource === "SAVED" && savedRx?.length ? (
                        <select name="prescriptionId" className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" defaultValue={savedRx[0].id} aria-label="اختر الوصفة">
                          {savedRx.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      ) : null}
                      {rxSource === "ENTERED" ? <PrescriptionFields prefix="rx." showAdd={type?.requiresAdd !== false} /> : null}
                      {rxSource === "UPLOADED" ? (
                        <div className="space-y-2 text-sm">
                          <input type="file" name="rxFile" accept="image/jpeg,image/png,image/webp,application/pdf" required className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2" />
                          <p className="text-xs text-ink-muted">JPG أو PNG أو PDF حتى 8 ميجابايت. يراجع أخصائي البصريات الوصفة قبل التصنيع وقد نتواصل معك لتأكيد القيم.</p>
                        </div>
                      ) : null}
                      {rxSource !== "SAVED" ? <input name="rxLabel" placeholder="اسم الوصفة (مثلاً: نظارة القراءة)" className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" maxLength={80} /> : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div className="flex items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">الكمية</span>
          <select name="quantity" defaultValue="1" className="h-12 w-20 rounded-md border border-line-strong bg-surface px-2 text-center">
            {Array.from({ length: Math.max(1, Math.min(maxQty, variant.available || 1)) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <SubmitButton size="lg" className="flex-1" disabled={outOfStock || Boolean(needsRx && !signedIn)} pendingLabel="جارٍ الإضافة…" onClick={() => track({ name: "add_to_cart", productId, variantId, value: variant.effectivePrice + lensPrice })}>
          {outOfStock ? "نفد من المخزون" : "أضف إلى السلة"}
        </SubmitButton>
      </div>

      {branches.length ? (
        <details className="rounded-lg border border-line bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">التوفر في الفروع</summary>
          <ul className="mt-2 space-y-1">
            {branches.map((b) => {
              const level = availability.find((a) => a.branchId === b.id && a.variantId === variantId)?.level ?? "none";
              return (
                <li key={b.id} className="flex justify-between">
                  <span>{b.name}</span>
                  <span className={level === "none" ? "text-ink-faint" : level === "low" ? "text-warning" : "text-success"}>{LEVEL[level]}</span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </ActionForm>
  );
}

function RxTab({ value, current, onChange, children }: { value: "SAVED" | "ENTERED" | "UPLOADED"; current: string; onChange: (v: "SAVED" | "ENTERED" | "UPLOADED") => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(value)} aria-pressed={current === value} className={cn("rounded-full border px-3 py-1.5", current === value ? "border-ink bg-ink text-surface" : "border-line-strong")}>
      {children}
    </button>
  );
}
