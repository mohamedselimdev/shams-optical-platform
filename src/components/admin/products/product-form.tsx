"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Plus, Trash2, ArrowUp } from "lucide-react";
import { ActionForm, type FormAction } from "@/ui/action-form";
import { CheckboxField, SelectField, TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Button } from "@/ui/button";
import { Card, CardBody, CardHeader } from "@/ui/primitives";

export type VariantRow = {
  key: string; id?: string; sku: string; barcode: string; colorName: string; colorHex: string; sizeLabel: string;
  lensWidthMm: string; bridgeMm: string; templeMm: string; frameWidthMm: string; price: string; salePrice: string; costPrice: string; isActive: boolean;
};
export type ImageRow = { key: string; url: string; alt: string; mediaId?: string };
export type ProductFormValues = {
  id?: string; slug: string; name: string; nameEn: string; description: string; type: string; status: string; brandId: string; categoryId: string; supplierId: string;
  gender: string; frameShape: string; frameMaterial: string; rimType: string; polarized: boolean; uvProtection: boolean; prescriptionCompatible: boolean; isFeatured: boolean;
  taxRateBps: string; seoTitle: string; seoDescription: string; collectionIds: string[]; variants: VariantRow[]; images: ImageRow[];
};
type Opt = { value: string; label: string };

const blankVariant = (): VariantRow => ({ key: crypto.randomUUID(), sku: "", barcode: "", colorName: "", colorHex: "", sizeLabel: "", lensWidthMm: "", bridgeMm: "", templeMm: "", frameWidthMm: "", price: "", salePrice: "", costPrice: "", isActive: true });

export function ProductForm({
  action, upload, initial, options, canPrice, canSeeCost,
}: {
  action: FormAction;
  upload: (form: FormData) => Promise<{ ok: true; url: string; mediaId: string } | { ok: false; error: string }>;
  initial: ProductFormValues;
  options: { brands: Opt[]; categories: Opt[]; collections: Opt[]; suppliers: Opt[]; types: Opt[]; statuses: Opt[]; genders: Opt[] };
  canPrice: boolean;
  canSeeCost: boolean;
}) {
  const [variants, setVariants] = useState<VariantRow[]>(initial.variants.length ? initial.variants : [blankVariant()]);
  const [images, setImages] = useState<ImageRow[]>(initial.images);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    startUpload(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await upload(fd);
      if (res.ok) setImages((imgs) => [...imgs, { key: res.mediaId, url: res.url, alt: "", mediaId: res.mediaId }]);
      else setUploadError(res.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  return (
    <ActionForm action={action} className="grid gap-6 xl:grid-cols-3">
      {initial.id ? <input type="hidden" name="productId" value={initial.id} /> : null}
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader title="البيانات الأساسية" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextField label="اسم المنتج" name="name" defaultValue={initial.name} required />
            <TextField label="الاسم بالإنجليزية" name="nameEn" defaultValue={initial.nameEn} dir="ltr" />
            <TextField label="الرابط (slug)" name="slug" defaultValue={initial.slug} dir="ltr" required hint="أحرف إنجليزية صغيرة وأرقام وشرطات" />
            <SelectField label="النوع" name="type" defaultValue={initial.type} options={options.types} required />
            <TextArea label="الوصف" name="description" defaultValue={initial.description} rows={5} className="sm:col-span-2" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="المتغيرات (اللون والمقاس)" description="كل متغير له SKU ومخزون وسعر مستقل. حذف متغير مستخدم يعطّله ولا يمحوه." actions={<Button size="sm" variant="secondary" onClick={() => setVariants((v) => [...v, blankVariant()])}><Plus className="h-4 w-4" aria-hidden />إضافة متغير</Button>} />
          <CardBody className="space-y-4">
            {variants.map((v, i) => (
              <fieldset key={v.key} className="rounded-lg border border-line p-4">
                <legend className="px-1 text-sm font-medium">متغير {i + 1}</legend>
                {v.id ? <input type="hidden" name={`variants.${i}.id`} value={v.id} /> : null}
                <div className="grid gap-3 sm:grid-cols-4">
                  <TextField label="SKU" name={`variants.${i}.sku`} errorKey={`variants.${i}.sku`} defaultValue={v.sku} dir="ltr" required />
                  <TextField label="الباركود" name={`variants.${i}.barcode`} defaultValue={v.barcode} dir="ltr" />
                  <TextField label="اللون" name={`variants.${i}.colorName`} defaultValue={v.colorName} />
                  <TextField label="كود اللون" name={`variants.${i}.colorHex`} errorKey={`variants.${i}.colorHex`} defaultValue={v.colorHex} placeholder="#1A1A1A" dir="ltr" />
                  <TextField label="المقاس" name={`variants.${i}.sizeLabel`} defaultValue={v.sizeLabel} placeholder="M" dir="ltr" />
                  <TextField label="عرض العدسة (مم)" name={`variants.${i}.lensWidthMm`} errorKey={`variants.${i}.lensWidthMm`} defaultValue={v.lensWidthMm} inputMode="numeric" dir="ltr" />
                  <TextField label="الجسر (مم)" name={`variants.${i}.bridgeMm`} errorKey={`variants.${i}.bridgeMm`} defaultValue={v.bridgeMm} inputMode="numeric" dir="ltr" />
                  <TextField label="الذراع (مم)" name={`variants.${i}.templeMm`} errorKey={`variants.${i}.templeMm`} defaultValue={v.templeMm} inputMode="numeric" dir="ltr" />
                  <TextField label="السعر (ج.م)" name={`variants.${i}.price`} errorKey={`variants.${i}.price`} defaultValue={v.price} inputMode="decimal" dir="ltr" required readOnly={!canPrice && Boolean(v.id)} />
                  <TextField label="سعر التخفيض" name={`variants.${i}.salePrice`} errorKey={`variants.${i}.salePrice`} defaultValue={v.salePrice} inputMode="decimal" dir="ltr" readOnly={!canPrice && Boolean(v.id)} />
                  {canSeeCost ? <TextField label="التكلفة" name={`variants.${i}.costPrice`} errorKey={`variants.${i}.costPrice`} defaultValue={v.costPrice} inputMode="decimal" dir="ltr" readOnly={!canPrice} /> : null}
                  <div className="flex items-end justify-between gap-2 sm:col-span-1">
                    <CheckboxField name={`variants.${i}.isActive`} label="نشط" defaultChecked={v.isActive} />
                    {variants.length > 1 ? (
                      <Button size="icon" variant="ghost" aria-label={`حذف المتغير ${i + 1}`} onClick={() => setVariants((rows) => rows.filter((r) => r.key !== v.key))}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </fieldset>
            ))}
            {!canPrice ? <p className="text-xs text-ink-muted">لا تملك صلاحية تعديل الأسعار؛ ستُرفض أي محاولة لتغييرها على الخادم.</p> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="الصور"
            actions={
              <>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="product-upload" onChange={(e) => onFile(e.target.files?.[0])} />
                <label htmlFor="product-upload" className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm hover:bg-surface-2">
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  {uploading ? "جارٍ الرفع…" : "رفع صورة"}
                </label>
              </>
            }
          />
          <CardBody>
            {uploadError ? <p role="alert" className="mb-3 text-sm text-danger">{uploadError}</p> : null}
            {images.length ? (
              <ul className="grid gap-3 sm:grid-cols-3">
                {images.map((img, i) => (
                  <li key={img.key} className="rounded-lg border border-line p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt || ""} className="aspect-[4/3] w-full rounded bg-surface-2 object-contain" />
                    <input type="hidden" name={`images.${i}.url`} value={img.url} />
                    {img.mediaId ? <input type="hidden" name={`images.${i}.mediaId`} value={img.mediaId} /> : null}
                    <input name={`images.${i}.alt`} defaultValue={img.alt} placeholder="وصف الصورة (لقارئ الشاشة)" className="mt-2 h-8 w-full rounded border border-line px-2 text-xs" aria-label="وصف الصورة" />
                    <div className="mt-1 flex justify-between">
                      <Button size="icon" variant="ghost" aria-label="تقديم الصورة" disabled={i === 0} onClick={() => setImages((rows) => { const c = [...rows]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                      <Button size="icon" variant="ghost" aria-label="حذف الصورة" onClick={() => setImages((rows) => rows.filter((r) => r.key !== img.key))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-muted">لا توجد صور. الصورة الأولى هي الصورة الرئيسية.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="محركات البحث" />
          <CardBody className="grid gap-4">
            <TextField label="عنوان SEO" name="seoTitle" defaultValue={initial.seoTitle} />
            <TextArea label="وصف SEO" name="seoDescription" defaultValue={initial.seoDescription} rows={2} />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="النشر" />
          <CardBody className="space-y-4">
            <SelectField label="الحالة" name="status" defaultValue={initial.status} options={options.statuses} />
            <CheckboxField name="isFeatured" label="منتج مميز في الصفحة الرئيسية" defaultChecked={initial.isFeatured} />
            <SubmitButton className="w-full" pendingLabel="جارٍ الحفظ…">حفظ المنتج</SubmitButton>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="التصنيف" />
          <CardBody className="space-y-4">
            <SelectField label="الماركة" name="brandId" defaultValue={initial.brandId} options={options.brands} placeholder="بدون" />
            <SelectField label="التصنيف" name="categoryId" defaultValue={initial.categoryId} options={options.categories} placeholder="بدون" />
            <SelectField label="المورد" name="supplierId" defaultValue={initial.supplierId} options={options.suppliers} placeholder="بدون" />
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-soft">المجموعات</legend>
              <div className="space-y-2">
                {options.collections.map((c) => (
                  <CheckboxField key={c.value} name="collectionIds[]" value={c.value} label={c.label} defaultChecked={initial.collectionIds.includes(c.value)} />
                ))}
              </div>
            </fieldset>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="مواصفات النظارة" />
          <CardBody className="space-y-4">
            <SelectField label="الفئة" name="gender" defaultValue={initial.gender} options={options.genders} placeholder="غير محدد" />
            <TextField label="شكل الإطار" name="frameShape" defaultValue={initial.frameShape} placeholder="مستطيل، دائري…" />
            <TextField label="الخامة" name="frameMaterial" defaultValue={initial.frameMaterial} placeholder="أسيتات، معدن…" />
            <TextField label="نوع الإطار" name="rimType" defaultValue={initial.rimType} placeholder="كامل، نصف إطار…" />
            <CheckboxField name="prescriptionCompatible" label="يقبل تركيب عدسات طبية" defaultChecked={initial.prescriptionCompatible} />
            <CheckboxField name="polarized" label="مستقطب (Polarized)" defaultChecked={initial.polarized} />
            <CheckboxField name="uvProtection" label="حماية من الأشعة فوق البنفسجية" defaultChecked={initial.uvProtection} />
            <TextField label="نسبة الضريبة (نقطة أساس)" name="taxRateBps" defaultValue={initial.taxRateBps} hint="اتركه فارغاً لاستخدام النسبة الافتراضية (1400 = 14%)" inputMode="numeric" dir="ltr" />
          </CardBody>
        </Card>
      </div>
    </ActionForm>
  );
}
