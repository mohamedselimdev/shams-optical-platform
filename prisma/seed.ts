/**
 * Development / staging seed. Creates roles, an owner account, branches, a sample optical catalog,
 * lens configurator tables, shipping, promotions, CMS content and opening stock (via the ledger).
 * Run: npm run db:seed   (refuses to run on a non-empty database unless SEED_FORCE=1)
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { SYSTEM_ROLES, ALL_PERMISSIONS } from "../src/server/rbac/permissions";
import { applyMovement } from "../src/modules/inventory/ledger";
import { GOVERNORATES } from "../src/lib/egypt";
import { frameSvg, type FrameShape } from "../src/lib/frame-art";
import { parseBlocks } from "../src/modules/cms/blocks";

const EGP = (v: number) => Math.round(v * 100);

async function main() {
  const existing = await db.role.count();
  if (existing > 0 && process.env.SEED_FORCE !== "1") {
    console.log("Database already seeded. Use `npm run db:reset` for a clean dev database.");
    return;
  }

  // ── Roles ──
  const roles = new Map<string, string>();
  for (const r of SYSTEM_ROLES) {
    const perms = r.permissions === "*" ? ALL_PERMISSIONS : r.permissions;
    const role = await db.role.create({
      data: { key: r.key, name: r.name, description: r.description, isSystem: true, permissions: { create: [...new Set(perms)].map((permission) => ({ permission })) } },
    });
    roles.set(r.key, role.id);
  }

  // ── Branches ──
  const branchData = [
    { code: "ZMK", slug: "zamalek", name: "شمس الزمالك", governorate: "القاهرة", city: "الزمالك", addressLine: "26 شارع 26 يوليو، الزمالك", phone: "0227350000", latitude: 30.0626, longitude: 31.2197, shipsOnline: true, sortOrder: 1 },
    { code: "NSR", slug: "nasr-city", name: "شمس مدينة نصر", governorate: "القاهرة", city: "مدينة نصر", addressLine: "15 شارع عباس العقاد", phone: "0222700000", latitude: 30.0561, longitude: 31.3301, shipsOnline: false, sortOrder: 2 },
    { code: "ALX", slug: "alexandria-smouha", name: "شمس سموحة", governorate: "الإسكندرية", city: "سموحة", addressLine: "8 شارع فوزي معاذ، سموحة", phone: "034250000", latitude: 31.2156, longitude: 29.9553, shipsOnline: false, sortOrder: 3 },
    { code: "GIZ", slug: "sheikh-zayed", name: "شمس الشيخ زايد", governorate: "الجيزة", city: "الشيخ زايد", addressLine: "مول أركان، الشيخ زايد", phone: "0238500000", latitude: 30.0207, longitude: 30.9791, shipsOnline: false, sortOrder: 4 },
  ];
  const branches: { id: string; code: string }[] = [];
  for (const b of branchData) {
    branches.push(await db.branch.create({ data: { ...b, type: "STORE", openingHours: { text: "يومياً 11 صباحاً – 11 مساءً" } } }));
  }
  const warehouse = await db.branch.create({
    data: { code: "WH1", slug: "main-warehouse", name: "المخزن الرئيسي", type: "WAREHOUSE", governorate: "القاهرة", city: "العبور", addressLine: "المنطقة الصناعية، العبور", pickupEnabled: false, shipsOnline: true, sortOrder: 0 },
  });

  // ── Staff ──
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || randomBytes(9).toString("base64url");
  const staffPassword = process.env.SEED_STAFF_PASSWORD || "Shams-Staff-2026!";
  const staffSeed: { email: string; name: string; code: string; role: string; all?: boolean; branch?: string; password: string }[] = [
    { email: "owner@shams.example", name: "مالك شمس", code: "OWN-001", role: "owner", all: true, password: ownerPassword },
    { email: "ops@shams.example", name: "مدير العمليات", code: "OPS-001", role: "operations_manager", all: true, password: staffPassword },
    { email: "zamalek.manager@shams.example", name: "مدير فرع الزمالك", code: "BM-ZMK", role: "branch_manager", branch: "ZMK", password: staffPassword },
    { email: "zamalek.sales@shams.example", name: "مبيعات الزمالك", code: "SL-ZMK", role: "sales", branch: "ZMK", password: staffPassword },
    { email: "inventory@shams.example", name: "أمين المخزن", code: "INV-001", role: "inventory", branch: "WH1", password: staffPassword },
    { email: "accountant@shams.example", name: "المحاسب", code: "ACC-001", role: "accountant", all: true, password: staffPassword },
    { email: "marketing@shams.example", name: "التسويق", code: "MKT-001", role: "marketing", all: true, password: staffPassword },
    { email: "analyst@shams.example", name: "محلل البيانات", code: "ANL-001", role: "analytics_viewer", all: true, password: staffPassword },
  ];
  const allBranches = [...branches, warehouse];
  for (const s of staffSeed) {
    const userId = crypto.randomUUID();
    const branch = s.branch ? allBranches.find((b) => b.code === s.branch) : undefined;
    await db.user.create({ data: { id: userId, name: s.name, email: s.email, emailVerified: true, kind: "STAFF" } });
    await db.account.create({ data: { id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: await hashPassword(s.password) } });
    await db.staffProfile.create({
      data: {
        userId,
        employeeCode: s.code,
        allBranches: Boolean(s.all),
        defaultBranchId: branch?.id ?? branches[0].id,
        roles: { create: [{ roleId: roles.get(s.role)! }] },
        branches: branch ? { create: [{ branchId: branch.id }] } : undefined,
      },
    });
  }

  // ── Catalog taxonomy ──
  const cat = async (slug: string, name: string, nameEn: string, sortOrder: number, parentId?: string) =>
    db.category.create({ data: { slug, name, nameEn, sortOrder, parentId: parentId ?? null } });
  const eyeglasses = await cat("eyeglasses", "نظارات طبية", "Eyeglasses", 1);
  const sunglasses = await cat("sunglasses", "نظارات شمسية", "Sunglasses", 2);
  const accessories = await cat("accessories", "إكسسوارات", "Accessories", 3);
  const kids = await cat("kids-eyeglasses", "نظارات أطفال", "Kids Eyeglasses", 4, eyeglasses.id);

  const brandRows = [
    ["shams-atelier", "شمس أتيليه", "Shams Atelier"],
    ["ray-ban", "راي بان", "Ray-Ban"],
    ["oakley", "أوكلي", "Oakley"],
    ["carrera", "كاريرا", "Carrera"],
    ["vogue-eyewear", "فوج", "Vogue Eyewear"],
  ];
  const brands = new Map<string, string>();
  for (const [i, [slug, name, nameEn]] of brandRows.entries()) {
    brands.set(slug, (await db.brand.create({ data: { slug, name, nameEn, sortOrder: i } })).id);
  }
  const newSeason = await db.collection.create({ data: { slug: "new-season", name: "وصل حديثاً", nameEn: "New Season", sortOrder: 1 } });
  const nile = await db.collection.create({ data: { slug: "nile-edit", name: "مجموعة النيل", nameEn: "The Nile Edit", description: "تصاميم مستوحاة من ضوء الشمس على النيل", sortOrder: 2 } });

  const supplier = await db.supplier.create({ data: { code: "LUX-EG", name: "لوكس أوبتكس مصر", contactName: "أحمد سمير", phone: "01000000001", email: "orders@luxoptics.example", paymentTerms: "30 يوم" } });
  const supplier2 = await db.supplier.create({ data: { code: "ATL-FAC", name: "مصنع أتيليه للإطارات", contactName: "منى عادل", phone: "01000000002", paymentTerms: "نقداً عند الاستلام" } });

  // ── Products ──
  const artDir = path.resolve("public/catalog");
  await mkdir(artDir, { recursive: true });
  type V = { color: string; hex: string; size: string; lw: number; br: number; tp: number; fw: number; price: number; sale?: number; cost: number };
  type P = { slug: string; name: string; nameEn: string; brand: string; type: "FRAME" | "SUNGLASSES" | "ACCESSORY"; category: string; shape?: FrameShape; material?: string; rim?: string; gender?: "MEN" | "WOMEN" | "UNISEX" | "KIDS"; polarized?: boolean; uv?: boolean; rx?: boolean; featured?: boolean; collections?: string[]; desc: string; variants: V[]; tint?: string; supplier?: string };
  const v = (color: string, hex: string, price: number, cost: number, sale?: number, size = "M", lw = 52, br = 19, tp = 145, fw = 138): V => ({ color, hex, size, lw, br, tp, fw, price, sale, cost });
  const products: P[] = [
    { slug: "atelier-nour-round", name: "نور — إطار دائري", nameEn: "Nour Round", brand: "shams-atelier", type: "FRAME", category: eyeglasses.id, shape: "round", material: "أسيتات", rim: "كامل", gender: "UNISEX", rx: true, featured: true, collections: [nile.id, newSeason.id], desc: "إطار دائري كلاسيكي من الأسيتات الإيطالي بلمسة عصرية خفيفة الوزن، مناسب للاستخدام اليومي.", variants: [v("أسود لامع", "#1d1d1f", 1850, 620), v("هافانا", "#7a4a2a", 1850, 620), v("عسلي شفاف", "#c89b5a", 1950, 650)], supplier: "ATL" },
    { slug: "atelier-karnak-square", name: "الكرنك — إطار مربع", nameEn: "Karnak Square", brand: "shams-atelier", type: "FRAME", category: eyeglasses.id, shape: "square", material: "أسيتات", rim: "كامل", gender: "MEN", rx: true, featured: true, collections: [nile.id], desc: "خطوط مربعة جريئة وحضور قوي، بمفصلات معدنية مرنة.", variants: [v("أسود مطفي", "#2b2b2b", 2100, 700, undefined, "L", 54, 18, 145, 142), v("كحلي", "#1f2a44", 2100, 700, 1790, "L", 54, 18, 145, 142)], supplier: "ATL" },
    { slug: "atelier-luxor-cat-eye", name: "الأقصر — عين القطة", nameEn: "Luxor Cat-Eye", brand: "shams-atelier", type: "FRAME", category: eyeglasses.id, shape: "cat-eye", material: "أسيتات", rim: "كامل", gender: "WOMEN", rx: true, featured: true, collections: [newSeason.id], desc: "تصميم عين القطة الأنثوي بزوايا مرفوعة ناعمة يبرز ملامح الوجه.", variants: [v("وردي عتيق", "#c98b8b", 2250, 760), v("أسود", "#151515", 2250, 760), v("سلحفائي", "#8a5a32", 2350, 780)], supplier: "ATL" },
    { slug: "atelier-siwa-titanium", name: "سيوة — تيتانيوم", nameEn: "Siwa Titanium", brand: "shams-atelier", type: "FRAME", category: eyeglasses.id, shape: "oval", material: "تيتانيوم", rim: "نصف إطار", gender: "UNISEX", rx: true, collections: [nile.id], desc: "إطار تيتانيوم فائق الخفة ومضاد للحساسية، مثالي لساعات العمل الطويلة.", variants: [v("ذهبي", "#b8954a", 3400, 1300), v("فضي", "#a8a9ad", 3400, 1300), v("جن ميتال", "#53565a", 3400, 1300)], supplier: "ATL" },
    { slug: "rayban-rx5154-clubmaster", name: "راي بان كلوب ماستر RX5154", nameEn: "Ray-Ban Clubmaster Optics RX5154", brand: "ray-ban", type: "FRAME", category: eyeglasses.id, shape: "browline", material: "أسيتات ومعدن", rim: "كامل", gender: "UNISEX", rx: true, featured: true, desc: "أيقونة الخمسينيات بتصميم الحاجب المميز، إطار طبي أصلي.", variants: [v("أسود/ذهبي", "#1a1a1a", 6200, 3900, undefined, "51", 51, 21, 145, 136), v("هافانا/ذهبي", "#6b4226", 6200, 3900, 5600, "51", 51, 21, 145, 136)], supplier: "LUX" },
    { slug: "rayban-rx7047-rectangle", name: "راي بان RX7047", nameEn: "Ray-Ban RX7047", brand: "ray-ban", type: "FRAME", category: eyeglasses.id, shape: "rectangle", material: "بلاستيك", rim: "كامل", gender: "MEN", rx: true, desc: "إطار مستطيل خفيف بتصميم بسيط ومتين.", variants: [v("أسود مطفي", "#222", 4900, 3100, undefined, "56", 56, 17, 145, 140)], supplier: "LUX" },
    { slug: "vogue-vo5286-oval", name: "فوج VO5286", nameEn: "Vogue VO5286", brand: "vogue-eyewear", type: "FRAME", category: eyeglasses.id, shape: "oval", material: "أسيتات", rim: "كامل", gender: "WOMEN", rx: true, collections: [newSeason.id], desc: "إطار بيضاوي أنيق بألوان موسمية.", variants: [v("بنفسجي شفاف", "#7d5ba6", 3900, 2400), v("بيج", "#d8c3a5", 3900, 2400)], supplier: "LUX" },
    { slug: "atelier-mini-kids", name: "شمس ميني — أطفال", nameEn: "Shams Mini Kids", brand: "shams-atelier", type: "FRAME", category: kids.id, shape: "round", material: "TR90 مرن", rim: "كامل", gender: "KIDS", rx: true, desc: "إطار مرن غير قابل للكسر للأطفال مع أذرع مريحة.", variants: [v("أزرق", "#2f6fb5", 1250, 380, undefined, "S", 44, 16, 125, 118), v("أحمر", "#c0392b", 1250, 380, undefined, "S", 44, 16, 125, 118)], supplier: "ATL" },
    { slug: "rayban-aviator-classic", name: "راي بان أفياتور كلاسيك", nameEn: "Ray-Ban Aviator Classic", brand: "ray-ban", type: "SUNGLASSES", category: sunglasses.id, shape: "aviator", material: "معدن", rim: "كامل", gender: "UNISEX", uv: true, polarized: true, featured: true, tint: "rgba(40,60,40,0.55)", desc: "النظارة الشمسية الأشهر عالمياً بعدسات مستقطبة وحماية كاملة من الأشعة فوق البنفسجية.", variants: [v("ذهبي/أخضر", "#b8954a", 7400, 4600, undefined, "58", 58, 14, 135, 140), v("فضي/رمادي", "#a8a9ad", 7400, 4600, 6900, "58", 58, 14, 135, 140)], supplier: "LUX" },
    { slug: "rayban-wayfarer", name: "راي بان وايفيرر", nameEn: "Ray-Ban Wayfarer", brand: "ray-ban", type: "SUNGLASSES", category: sunglasses.id, shape: "square", material: "أسيتات", rim: "كامل", gender: "UNISEX", uv: true, tint: "rgba(20,20,20,0.6)", desc: "تصميم خالد بإطار أسيتات وعدسات G-15.", variants: [v("أسود", "#111", 6800, 4200, undefined, "50", 50, 22, 150, 142)], supplier: "LUX" },
    { slug: "oakley-holbrook", name: "أوكلي هولبروك", nameEn: "Oakley Holbrook", brand: "oakley", type: "SUNGLASSES", category: sunglasses.id, shape: "rectangle", material: "O Matter", rim: "كامل", gender: "MEN", uv: true, polarized: true, tint: "rgba(30,50,90,0.55)", desc: "نظارة رياضية عصرية بعدسات Prizm المستقطبة.", variants: [v("أسود مطفي/بريزم", "#1b1b1b", 7900, 5000, undefined, "57", 57, 18, 137, 139)], supplier: "LUX" },
    { slug: "carrera-champion", name: "كاريرا تشامبيون", nameEn: "Carrera Champion", brand: "carrera", type: "SUNGLASSES", category: sunglasses.id, shape: "aviator", material: "أسيتات", rim: "كامل", gender: "MEN", uv: true, tint: "rgba(70,50,30,0.5)", desc: "روح السباقات بتصميم جريء.", variants: [v("هافانا", "#6b4226", 5200, 3200, 4600)], supplier: "LUX" },
    { slug: "atelier-dahab-sun", name: "دهب — شمسية", nameEn: "Dahab Sun", brand: "shams-atelier", type: "SUNGLASSES", category: sunglasses.id, shape: "cat-eye", material: "أسيتات", rim: "كامل", gender: "WOMEN", uv: true, collections: [nile.id, newSeason.id], tint: "rgba(90,50,30,0.5)", desc: "نظارة شمسية عين القطة بإطار سميك وعدسات متدرجة.", variants: [v("كريمي", "#eadbc8", 2600, 900), v("أسود", "#141414", 2600, 900)], supplier: "ATL" },
    { slug: "premium-hard-case", name: "جراب نظارة جلد", nameEn: "Leather Hard Case", brand: "shams-atelier", type: "ACCESSORY", category: accessories.id, desc: "جراب صلب مبطن بالجلد يحمي نظارتك.", variants: [v("بني", "#6b4226", 450, 120), v("أسود", "#111", 450, 120)], supplier: "ATL" },
    { slug: "lens-cleaning-kit", name: "طقم تنظيف العدسات", nameEn: "Lens Cleaning Kit", brand: "shams-atelier", type: "ACCESSORY", category: accessories.id, desc: "بخاخ تنظيف 60 مل مع قطعة مايكروفايبر.", variants: [v("—", "#ffffff", 180, 45)], supplier: "ATL" },
  ];

  const skuFor = (p: P, i: number) => `${p.slug.split("-").map((x) => x[0]).join("").toUpperCase()}-${String(i + 1).padStart(2, "0")}-${p.slug.length}`;
  let barcode = 6221000000000;
  const createdVariants: { id: string; type: string; price: number }[] = [];
  for (const p of products) {
    const product = await db.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        nameEn: p.nameEn,
        description: p.desc,
        type: p.type,
        status: "ACTIVE",
        publishedAt: new Date(Date.now() - Math.floor(Math.random() * 60) * 86_400_000),
        brandId: brands.get(p.brand)!,
        categoryId: p.category,
        supplierId: p.supplier === "LUX" ? supplier.id : supplier2.id,
        gender: p.gender ?? null,
        frameShape: p.shape ?? null,
        frameMaterial: p.material ?? null,
        rimType: p.rim ?? null,
        polarized: Boolean(p.polarized),
        uvProtection: Boolean(p.uv),
        prescriptionCompatible: Boolean(p.rx),
        isFeatured: Boolean(p.featured),
        collections: p.collections ? { create: p.collections.map((collectionId) => ({ collectionId })) } : undefined,
      },
    });
    let min = Infinity;
    for (const [i, vr] of p.variants.entries()) {
      const variant = await db.productVariant.create({
        data: {
          productId: product.id,
          sku: skuFor(p, i),
          barcode: String(barcode++),
          colorName: vr.color === "—" ? null : vr.color,
          colorHex: vr.hex,
          sizeLabel: p.type === "ACCESSORY" ? null : vr.size,
          lensWidthMm: p.type === "ACCESSORY" ? null : vr.lw,
          bridgeMm: p.type === "ACCESSORY" ? null : vr.br,
          templeMm: p.type === "ACCESSORY" ? null : vr.tp,
          frameWidthMm: p.type === "ACCESSORY" ? null : vr.fw,
          price: EGP(vr.price),
          salePrice: vr.sale ? EGP(vr.sale) : null,
          costPrice: EGP(vr.cost),
          sortOrder: i,
        },
      });
      min = Math.min(min, EGP(vr.sale ?? vr.price));
      createdVariants.push({ id: variant.id, type: p.type, price: variant.price });
      if (p.shape) {
        const file = `${p.slug}-${i + 1}.svg`;
        await writeFile(path.join(artDir, file), frameSvg({ shape: p.shape, color: vr.hex, lensTint: p.tint }), "utf8");
        await db.productImage.create({ data: { productId: product.id, variantId: variant.id, url: `/catalog/${file}`, alt: `${p.name} — ${vr.color}`, sortOrder: i } });
      }
    }
    if (!p.shape) {
      const file = `${p.slug}.svg`;
      await writeFile(path.join(artDir, file), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#f6f2ea"/><rect x="230" y="210" width="340" height="180" rx="90" fill="${p.variants[0].hex === "#ffffff" ? "#dfe8ef" : p.variants[0].hex}"/><rect x="250" y="285" width="300" height="10" rx="5" fill="rgba(255,255,255,0.4)"/></svg>`, "utf8");
      await db.productImage.create({ data: { productId: product.id, url: `/catalog/${file}`, alt: p.name, sortOrder: 0 } });
    }
    await db.product.update({ where: { id: product.id }, data: { minPrice: min } });
  }

  // ── Opening stock through the ledger ──
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@shams.example" } });
  await db.$transaction(
    async (tx) => {
      for (const [vi, variant] of createdVariants.entries()) {
        const locations = [warehouse, ...branches];
        for (const [bi, b] of locations.entries()) {
          const qty = b.id === warehouse.id ? 12 + (vi % 5) * 3 : (vi + bi) % 4 === 0 ? 0 : 2 + ((vi * 3 + bi) % 6);
          if (qty > 0) {
            await applyMovement(tx, { branchId: b.id, variantId: variant.id, type: "OPENING_BALANCE", quantity: qty, reason: "رصيد افتتاحي", referenceType: "seed", actorId: owner.id });
          }
        }
      }
      await tx.inventoryItem.updateMany({ data: { reorderPoint: 2 } });
    },
    { timeout: 120_000 },
  );

  // ── Lens configurator ──
  const types = {
    single: await db.lensType.create({ data: { key: "SINGLE_VISION", name: "رؤية أحادية", nameEn: "Single Vision", description: "لقصر أو طول النظر أو الاستجماتيزم", requiresPrescription: true, sortOrder: 1 } }),
    progressive: await db.lensType.create({ data: { key: "PROGRESSIVE", name: "متعددة البؤر (بروجريسف)", nameEn: "Progressive", description: "رؤية واضحة للبعيد والمتوسط والقريب بدون خطوط", requiresPrescription: true, requiresAdd: true, sortOrder: 2 } }),
    bifocal: await db.lensType.create({ data: { key: "BIFOCAL", name: "ثنائية البؤرة", nameEn: "Bifocal", description: "منطقتان للبعيد والقريب", requiresPrescription: true, requiresAdd: true, sortOrder: 3 } }),
    plano: await db.lensType.create({ data: { key: "NON_PRESCRIPTION", name: "بدون مقاس", nameEn: "Non-prescription", description: "عدسات حماية بدون مقاس (مثل حماية الشاشات)", requiresPrescription: false, sortOrder: 4 } }),
  };
  const idx = {
    i150: await db.lensIndex.create({ data: { key: "1.50", value: 150, name: "1.50 قياسي", minSph: -400, maxSph: 400, maxCyl: 200, sortOrder: 1 } }),
    i156: await db.lensIndex.create({ data: { key: "1.56", value: 156, name: "1.56 رفيع", minSph: -600, maxSph: 500, maxCyl: 300, sortOrder: 2 } }),
    i160: await db.lensIndex.create({ data: { key: "1.60", value: 160, name: "1.60 رفيع جداً", minSph: -800, maxSph: 600, maxCyl: 400, sortOrder: 3 } }),
    i167: await db.lensIndex.create({ data: { key: "1.67", value: 167, name: "1.67 فائق الرفع", minSph: -1000, maxSph: 800, maxCyl: 400, sortOrder: 4 } }),
    i174: await db.lensIndex.create({ data: { key: "1.74", value: 174, name: "1.74 الأرفع", minSph: -1400, maxSph: 800, maxCyl: 600, sortOrder: 5 } }),
  };
  const prices: [string, string, number][] = [
    [types.single.id, idx.i150.id, 450], [types.single.id, idx.i156.id, 650], [types.single.id, idx.i160.id, 950], [types.single.id, idx.i167.id, 1400], [types.single.id, idx.i174.id, 2200],
    [types.progressive.id, idx.i150.id, 1800], [types.progressive.id, idx.i160.id, 2600], [types.progressive.id, idx.i167.id, 3400],
    [types.bifocal.id, idx.i150.id, 1100], [types.bifocal.id, idx.i156.id, 1300],
    [types.plano.id, idx.i150.id, 350], [types.plano.id, idx.i156.id, 450],
  ];
  for (const [lensTypeId, lensIndexId, price] of prices) await db.lensPackagePrice.create({ data: { lensTypeId, lensIndexId, price: EGP(price) } });
  await db.lensOption.create({ data: { key: "AR", name: "مضاد للانعكاس", nameEn: "Anti-reflective", group: "COATING", price: EGP(250), sortOrder: 1, description: "يقلل الانعكاسات ويحسن الرؤية الليلية" } });
  await db.lensOption.create({ data: { key: "BLUE", name: "حماية من الضوء الأزرق", nameEn: "Blue-light filter", group: "BLUE_LIGHT", price: EGP(400), sortOrder: 2, description: "مثالي للاستخدام الطويل للشاشات" } });
  await db.lensOption.create({ data: { key: "PHOTO", name: "فوتوكروميك (متغيرة اللون)", nameEn: "Photochromic", group: "PHOTOCHROMIC", price: EGP(900), sortOrder: 3, description: "تغمق تلقائياً في الشمس" } });
  await db.lensOption.create({ data: { key: "TINT", name: "تلوين خفيف", nameEn: "Light tint", group: "TINT", price: EGP(200), sortOrder: 4 } });
  await db.lensOption.create({ data: { key: "POLAR", name: "عدسات مستقطبة", nameEn: "Polarized", group: "POLARIZATION", price: EGP(700), sortOrder: 5, rules: { create: [{ lensTypeId: types.single.id }] } } });

  // ── Shipping ──
  const cairoGiza = ["القاهرة", "الجيزة", "القليوبية"];
  const z1 = await db.shippingZone.create({ data: { name: "القاهرة الكبرى", governorates: cairoGiza, sortOrder: 1 } });
  await db.shippingRate.create({ data: { zoneId: z1.id, name: "توصيل عادي", price: EGP(60), freeOverTotal: EGP(2500), minDays: 1, maxDays: 3, codAllowed: true, codFee: EGP(15) } });
  await db.shippingRate.create({ data: { zoneId: z1.id, name: "توصيل في نفس اليوم", price: EGP(120), minDays: 0, maxDays: 0, codAllowed: true, codFee: EGP(15) } });
  const z2 = await db.shippingZone.create({ data: { name: "الإسكندرية والدلتا", governorates: ["الإسكندرية", "البحيرة", "الغربية", "المنوفية", "الدقهلية", "الشرقية", "كفر الشيخ", "دمياط"], sortOrder: 2 } });
  await db.shippingRate.create({ data: { zoneId: z2.id, name: "توصيل عادي", price: EGP(75), freeOverTotal: EGP(3000), minDays: 2, maxDays: 4, codAllowed: true, codFee: EGP(20) } });
  const covered = new Set([...cairoGiza, ...z2.governorates]);
  const z3 = await db.shippingZone.create({ data: { name: "باقي المحافظات", governorates: GOVERNORATES.filter((g) => !covered.has(g)), sortOrder: 3 } });
  await db.shippingRate.create({ data: { zoneId: z3.id, name: "توصيل عادي", price: EGP(95), freeOverTotal: EGP(3500), minDays: 3, maxDays: 6, codAllowed: true, codFee: EGP(25) } });

  // ── Promotions ──
  await db.promotion.create({ data: { name: "خصم الترحيب 10%", kind: "COUPON", code: "WELCOME10", discountType: "PERCENTAGE", value: 1000, maxDiscount: EGP(500), eligibility: "NEW_CUSTOMERS", usagePerCustomer: 1, description: "لأول طلب فقط" } });
  await db.promotion.create({ data: { name: "خصم 300 جنيه على الإطارات الطبية", kind: "COUPON", code: "FRAME300", discountType: "FIXED_AMOUNT", value: EGP(300), minSubtotal: EGP(2000), scope: "CATEGORIES", targetIds: [eyeglasses.id], includeLenses: false, usageLimit: 500 } });
  await db.promotion.create({ data: { name: "15% على مجموعة النيل", kind: "AUTOMATIC", discountType: "PERCENTAGE", value: 1500, scope: "COLLECTIONS", targetIds: [nile.id], excludeSaleItems: true, includeLenses: false, stackable: false, priority: 10 } });

  // ── Settings ──
  await db.setting.create({ data: { key: "checkout", value: { onlineFulfillmentBranchId: warehouse.id } } });

  // ── CMS ──
  const page = async (slug: string, title: string, source: string) =>
    db.contentPage.create({ data: { slug, title, blocks: parseBlocks(source), status: "PUBLISHED", showInFooter: true } });
  await page("shipping", "الشحن والتوصيل", "## مدة التوصيل\n\nنوصل لجميع محافظات مصر. القاهرة الكبرى خلال 1–3 أيام عمل، وباقي المحافظات خلال 3–6 أيام.\n\n## النظارات الطبية\n\nالطلبات التي تحتوي على عدسات طبية تحتاج 3–5 أيام إضافية للتجهيز في معملنا بعد اعتماد الوصفة.\n\n## الاستلام من الفرع\n\nيمكنك اختيار الاستلام من أي فرع وسنبلغك عندما يكون طلبك جاهزاً.");
  await page("returns-policy", "سياسة الاستبدال والاسترجاع", "## مدة الاسترجاع\n\nيمكنك طلب الاسترجاع خلال 14 يوماً من تاريخ الاستلام للمنتجات بحالتها الأصلية.\n\n## العدسات الطبية\n\n> العدسات الطبية المصنعة حسب مقاسك غير قابلة للاسترجاع إلا في حالة وجود عيب تصنيع.\n\n## خطوات الاسترجاع\n\n1. افتح طلبك من حسابك واختر طلب استرجاع.\n2. سنراجع الطلب ونتواصل معك.\n3. بعد استلام وفحص المنتج يتم رد المبلغ بنفس طريقة الدفع.");
  await page("privacy", "سياسة الخصوصية", "## بياناتك الطبية\n\nنتعامل مع الوصفات الطبية كبيانات خاصة: لا يطلع عليها إلا الموظفون المختصون، ويتم تسجيل كل وصول إليها.\n\n## ملفات تعريف الارتباط\n\nنستخدم ملفات ضرورية لتشغيل السلة وتسجيل الدخول، وملفات تحليلات اختيارية فقط بعد موافقتك.\n\n## حقوقك\n\nيمكنك طلب نسخة من بياناتك أو حذفها بالتواصل مع خدمة العملاء.");
  await page("terms", "الشروط والأحكام", "## الأسعار\n\nجميع الأسعار بالجنيه المصري وتشمل ضريبة القيمة المضافة.\n\n## الطلبات\n\nيتم تأكيد الطلب بعد التحقق من توفر المنتجات واستلام الدفع أو اختيار الدفع عند الاستلام.");
  await page("faq", "الأسئلة الشائعة", "? كيف أعرف مقاس الإطار المناسب؟ | المقاس مكتوب على الذراع الداخلية لنظارتك الحالية بالترتيب: عرض العدسة – الجسر – طول الذراع.\n? هل يمكنني رفع صورة الوصفة؟ | نعم، يمكنك رفع صورة الوصفة أو إدخال القيم يدوياً، ويراجعها أخصائي البصريات قبل التصنيع.\n? كم يستغرق تجهيز النظارة الطبية؟ | من 3 إلى 5 أيام عمل بعد اعتماد الوصفة.");

  await db.banner.create({ data: { placement: "HOME_HERO", title: "شوف الدنيا بوضوح الشمس", subtitle: "إطارات مختارة بعناية وعدسات طبية مصنّعة في معملنا خلال أيام", ctaLabel: "تسوق الإطارات الطبية", ctaHref: "/c/eyeglasses", sortOrder: 1 } });
  await db.banner.create({ data: { placement: "HOME_PROMO", title: "مجموعة النيل", subtitle: "خصم 15% لفترة محدودة", ctaLabel: "اكتشف المجموعة", ctaHref: "/collections/nile-edit", sortOrder: 1 } });
  await db.announcement.create({ data: { message: "شحن مجاني للطلبات فوق 2,500 ج.م داخل القاهرة الكبرى", href: "/pages/shipping" } });
  const navItems: [string, string, number][] = [["نظارات طبية", "/c/eyeglasses", 1], ["نظارات شمسية", "/c/sunglasses", 2], ["إكسسوارات", "/c/accessories", 3], ["الماركات", "/brands", 4], ["العروض", "/search?sale=1", 5], ["فروعنا", "/stores", 6]];
  for (const [label, href, sortOrder] of navItems) await db.navigationItem.create({ data: { menu: "HEADER", label, href, sortOrder } });
  await db.homeSection.create({ data: { type: "FEATURED_PRODUCTS", title: "اختيارات شمس", config: { limit: 8 }, sortOrder: 1 } });
  await db.homeSection.create({ data: { type: "CATEGORIES", title: "تسوق حسب الفئة", config: {}, sortOrder: 2 } });
  await db.homeSection.create({ data: { type: "COLLECTION", title: "مجموعة النيل", config: { collectionSlug: "nile-edit", limit: 4 }, sortOrder: 3 } });
  await db.homeSection.create({ data: { type: "BRANDS", title: "ماركاتنا", config: {}, sortOrder: 4 } });
  await db.homeSection.create({ data: { type: "NEW_ARRIVALS", title: "وصل حديثاً", config: { limit: 8 }, sortOrder: 5 } });

  console.log("\n✔ Seed complete");
  console.log(`  Owner login: owner@shams.example / ${ownerPassword}`);
  console.log(`  Other staff (ops@, zamalek.manager@, zamalek.sales@, inventory@, accountant@, marketing@, analyst@shams.example) / ${staffPassword}`);
  console.log("  Change these passwords before any shared deployment.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
