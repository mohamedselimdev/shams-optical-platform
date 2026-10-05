/**
 * English content for the sample data created by prisma/seed.ts. Only fills English fields that are
 * still empty, so it is safe to re-run and never overwrites what staff have written.
 * Called at the end of prisma/seed.ts; for an existing database run: npm run db:seed-english
 */
import type { PrismaClient } from "../src/generated/prisma/client";
import { parseBlocks } from "../src/modules/cms/blocks";

const BRANCHES: Record<string, { nameEn: string; cityEn: string; addressLineEn: string }> = {
  zamalek: { nameEn: "SHAMS Zamalek", cityEn: "Zamalek", addressLineEn: "26 July Street 26, Zamalek" },
  "nasr-city": { nameEn: "SHAMS Nasr City", cityEn: "Nasr City", addressLineEn: "15 Abbas El Akkad Street" },
  "alexandria-smouha": { nameEn: "SHAMS Smouha", cityEn: "Smouha", addressLineEn: "8 Fawzy Moaz Street, Smouha" },
  "sheikh-zayed": { nameEn: "SHAMS Sheikh Zayed", cityEn: "Sheikh Zayed", addressLineEn: "Arkan Mall, Sheikh Zayed" },
  "main-warehouse": { nameEn: "Main warehouse", cityEn: "El Obour", addressLineEn: "Industrial Zone, El Obour" },
};

const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  "atelier-nour-round": "A classic round frame in Italian acetate with a light, modern touch, made for everyday wear.",
  "atelier-karnak-square": "Bold square lines and a strong presence, with flexible metal hinges.",
  "atelier-luxor-cat-eye": "A feminine cat-eye with softly lifted corners that frames the face.",
  "atelier-siwa-titanium": "An ultra-light, hypoallergenic titanium frame, ideal for long working days.",
  "rayban-rx5154-clubmaster": "The 1950s icon with its distinctive browline design. Genuine optical frame.",
  "rayban-rx7047-rectangle": "A light rectangular frame with a simple, durable design.",
  "vogue-vo5286-oval": "An elegant oval frame in seasonal colours.",
  "atelier-mini-kids": "A flexible, unbreakable kids' frame with comfortable temples.",
  "rayban-aviator-classic": "The world's most famous sunglasses, with polarized lenses and full UV protection.",
  "rayban-wayfarer": "A timeless design with an acetate frame and G-15 lenses.",
  "oakley-holbrook": "Modern sport sunglasses with polarized Prizm lenses.",
  "carrera-champion": "Racing spirit in a bold design.",
  "atelier-dahab-sun": "Cat-eye sunglasses with a thick frame and gradient lenses.",
  "premium-hard-case": "A leather-lined hard case that protects your glasses.",
  "lens-cleaning-kit": "60 ml cleaning spray with a microfibre cloth.",
};

// Variant colours and frame materials, keyed by the Arabic value stored on the product.
const COLORS: Record<string, string> = {
  أسود: "Black",
  "أسود لامع": "Glossy black",
  "أسود مطفي": "Matte black",
  "أسود مطفي/بريزم": "Matte black/Prizm",
  "أسود/ذهبي": "Black/Gold",
  أحمر: "Red",
  أزرق: "Blue",
  بني: "Brown",
  بيج: "Beige",
  "بنفسجي شفاف": "Clear violet",
  "جن ميتال": "Gunmetal",
  ذهبي: "Gold",
  "ذهبي/أخضر": "Gold/Green",
  سلحفائي: "Tortoise",
  "عسلي شفاف": "Clear honey",
  فضي: "Silver",
  "فضي/رمادي": "Silver/Grey",
  كحلي: "Navy",
  كريمي: "Cream",
  هافانا: "Havana",
  "هافانا/ذهبي": "Havana/Gold",
  "وردي عتيق": "Antique rose",
};

const MATERIALS: Record<string, string> = {
  أسيتات: "Acetate",
  "أسيتات ومعدن": "Acetate and metal",
  بلاستيك: "Plastic",
  تيتانيوم: "Titanium",
  "TR90 مرن": "Flexible TR90",
  معدن: "Metal",
};

const COLLECTION_DESCRIPTIONS: Record<string, string> = {
  "nile-edit": "Designs inspired by sunlight on the Nile",
};

const LENS_TYPES: Record<string, string> = {
  SINGLE_VISION: "For short-sightedness, long-sightedness or astigmatism",
  PROGRESSIVE: "Clear vision far, intermediate and near, with no visible lines",
  BIFOCAL: "Two zones, for distance and near",
  NON_PRESCRIPTION: "Protective lenses without a prescription (e.g. screen protection)",
};

const LENS_INDEXES: Record<string, string> = {
  "1.50": "1.50 Standard",
  "1.56": "1.56 Thin",
  "1.60": "1.60 Extra thin",
  "1.67": "1.67 Ultra thin",
  "1.74": "1.74 Thinnest",
};

const LENS_OPTIONS: Record<string, string> = {
  AR: "Reduces reflections and improves night vision",
  BLUE: "Ideal for long hours in front of screens",
  PHOTO: "Darkens automatically in sunlight",
};

const NAV: Record<string, string> = {
  "/c/eyeglasses": "Eyeglasses",
  "/c/sunglasses": "Sunglasses",
  "/c/accessories": "Accessories",
  "/brands": "Brands",
  "/search?sale=1": "Offers",
  "/stores": "Stores",
};

const HOME_SECTIONS: Record<string, string> = {
  "اختيارات شمس": "SHAMS picks",
  "تسوق حسب الفئة": "Shop by category",
  "مجموعة النيل": "The Nile Edit",
  ماركاتنا: "Our brands",
  "وصل حديثاً": "New arrivals",
};

const BANNERS: Record<string, { titleEn: string; subtitleEn: string; ctaLabelEn: string }> = {
  HOME_HERO: { titleEn: "See the world in sunlight clarity", subtitleEn: "Carefully chosen frames and prescription lenses made in our lab within days", ctaLabelEn: "Shop prescription frames" },
  HOME_PROMO: { titleEn: "The Nile Edit", subtitleEn: "15% off for a limited time", ctaLabelEn: "Discover the collection" },
};

const ANNOUNCEMENTS: Record<string, string> = {
  "/pages/shipping": "Free shipping on orders over EGP 2,500 within Greater Cairo",
};

const PAGES: Record<string, { title: string; source: string }> = {
  shipping: {
    title: "Shipping and delivery",
    source:
      "## Delivery times\n\nWe deliver to every governorate in Egypt: Greater Cairo within 1–3 working days, other governorates within 3–6 days.\n\n## Prescription glasses\n\nOrders with prescription lenses need 3–5 extra days in our lab after the prescription is approved.\n\n## Branch pickup\n\nYou can choose pickup from any branch and we will let you know when your order is ready.",
  },
  "returns-policy": {
    title: "Returns and exchanges",
    source:
      "## Return window\n\nYou can request a return within 14 days of delivery for items in their original condition.\n\n## Prescription lenses\n\n> Lenses made to your prescription cannot be returned unless they have a manufacturing defect.\n\n## How to return\n\n1. Open your order in your account and choose Request a return.\n2. We review the request and contact you.\n3. Once the item is received and inspected, we refund you by the original payment method.",
  },
  privacy: {
    title: "Privacy policy",
    source:
      "## Your medical data\n\nWe treat prescriptions as private data: only authorised staff can see them, and every access is logged.\n\n## Cookies\n\nWe use essential cookies to run the cart and sign-in, and optional analytics cookies only with your consent.\n\n## Your rights\n\nYou can request a copy of your data, or its deletion, by contacting customer care.",
  },
  terms: {
    title: "Terms and conditions",
    source: "## Prices\n\nAll prices are in Egyptian pounds and include VAT.\n\n## Orders\n\nAn order is confirmed once stock availability is verified and payment is received, or cash on delivery is selected.",
  },
  faq: {
    title: "FAQ",
    source:
      "? How do I find the right frame size? | The size is printed on the inside of the temple of your current glasses, in this order: lens width – bridge – temple length.\n? Can I upload a photo of my prescription? | Yes. You can upload a photo or enter the values yourself, and an optician reviews it before production.\n? How long does it take to make prescription glasses? | 3 to 5 working days after the prescription is approved.",
  },
};

export async function applyEnglishContent(db: PrismaClient) {
  let n = 0;
  const count = (r: { count: number }) => (n += r.count);
  for (const [slug, b] of Object.entries(BRANCHES)) {
    count(await db.branch.updateMany({ where: { slug, nameEn: null }, data: { nameEn: b.nameEn } }));
    count(await db.branch.updateMany({ where: { slug, cityEn: null }, data: { cityEn: b.cityEn } }));
    count(await db.branch.updateMany({ where: { slug, addressLineEn: null }, data: { addressLineEn: b.addressLineEn } }));
  }
  for (const [slug, descriptionEn] of Object.entries(PRODUCT_DESCRIPTIONS)) count(await db.product.updateMany({ where: { slug, descriptionEn: null }, data: { descriptionEn } }));
  for (const [colorName, colorNameEn] of Object.entries(COLORS)) count(await db.productVariant.updateMany({ where: { colorName, colorNameEn: null }, data: { colorNameEn } }));
  for (const [frameMaterial, frameMaterialEn] of Object.entries(MATERIALS)) count(await db.product.updateMany({ where: { frameMaterial, frameMaterialEn: null }, data: { frameMaterialEn } }));
  for (const [slug, descriptionEn] of Object.entries(COLLECTION_DESCRIPTIONS)) count(await db.collection.updateMany({ where: { slug, descriptionEn: null }, data: { descriptionEn } }));
  for (const [key, descriptionEn] of Object.entries(LENS_TYPES)) count(await db.lensType.updateMany({ where: { key, descriptionEn: null }, data: { descriptionEn } }));
  for (const [key, nameEn] of Object.entries(LENS_INDEXES)) count(await db.lensIndex.updateMany({ where: { key, nameEn: null }, data: { nameEn } }));
  for (const [key, descriptionEn] of Object.entries(LENS_OPTIONS)) count(await db.lensOption.updateMany({ where: { key, descriptionEn: null }, data: { descriptionEn } }));
  for (const [href, labelEn] of Object.entries(NAV)) count(await db.navigationItem.updateMany({ where: { href, labelEn: null }, data: { labelEn } }));
  for (const [title, titleEn] of Object.entries(HOME_SECTIONS)) count(await db.homeSection.updateMany({ where: { title, titleEn: null }, data: { titleEn } }));
  for (const [placement, data] of Object.entries(BANNERS)) count(await db.banner.updateMany({ where: { placement, titleEn: null }, data }));
  for (const [href, messageEn] of Object.entries(ANNOUNCEMENTS)) count(await db.announcement.updateMany({ where: { href, messageEn: null }, data: { messageEn } }));
  for (const [slug, p] of Object.entries(PAGES)) count(await db.contentPage.updateMany({ where: { slug, titleEn: null }, data: { titleEn: p.title, blocksEn: parseBlocks(p.source) } }));
  // Orders placed before the English names existed: copy the English variant label onto the order line.
  const items = await db.orderItem.findMany({ where: { variantNameEn: null, variant: { colorNameEn: { not: null } } }, select: { id: true, variant: { select: { colorNameEn: true, sizeLabel: true } } } });
  for (const it of items) {
    await db.orderItem.update({ where: { id: it.id }, data: { variantNameEn: [it.variant!.colorNameEn, it.variant!.sizeLabel].filter(Boolean).join(" / ") } });
    n++;
  }
  // Opening hours are JSON ({ text, textEn }); add the English text where missing.
  for (const b of await db.branch.findMany({ select: { id: true, openingHours: true } })) {
    const hours = b.openingHours as { text?: string; textEn?: string } | null;
    if (hours?.text === "يومياً 11 صباحاً – 11 مساءً" && !hours.textEn) {
      await db.branch.update({ where: { id: b.id }, data: { openingHours: { ...hours, textEn: "Daily 11 am – 11 pm" } } });
      n++;
    }
  }
  return n;
}

