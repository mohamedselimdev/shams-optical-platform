import { listPublicBranches } from "@/modules/branches/service";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("فروعنا"), description: t("عناوين ومواعيد فروع شمس للبصريات واستلام الطلبات.") };
}

export default async function Stores() {
  const t = await getT();
  const branches = await listPublicBranches();
  const jsonLd = branches.map((b) => ({
    "@context": "https://schema.org",
    "@type": "Optician",
    name: b.name,
    telephone: b.phone ?? undefined,
    address: { "@type": "PostalAddress", streetAddress: b.addressLine, addressLocality: b.city, addressRegion: b.governorate, addressCountry: "EG" },
    geo: b.latitude && b.longitude ? { "@type": "GeoCoordinates", latitude: b.latitude, longitude: b.longitude } : undefined,
  }));
  return (
    <div className="container-page py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <h1 className="mb-8 font-display text-3xl font-semibold">{t("فروعنا")}</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => {
          const hours = (b.openingHours as { text?: string } | null)?.text;
          return (
            <li key={b.id} className="rounded-lg border border-line bg-surface p-5 text-sm">
              <h2 className="font-display text-lg font-semibold">{b.name}</h2>
              <p className="mt-1 text-ink-soft">{t("{0}، {1}، {2}", [b.addressLine, b.city, t(b.governorate)])}</p>
              {hours ? <p className="mt-1 text-ink-muted">{hours}</p> : null}
              {b.phone ? <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="num mt-2 block" dir="ltr">{b.phone}</a> : null}
              <div className="mt-3 flex flex-wrap gap-3">
                {b.pickupEnabled ? <span className="text-success">{t("✓ استلام الطلبات")}</span> : null}
                {b.latitude && b.longitude ? <a href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`} target="_blank" rel="noopener" className="underline">{t("الاتجاهات")}</a> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
