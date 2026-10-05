import { expect, test, type Page } from "@playwright/test";

/**
 * Acceptance flow from the specification: browse → choose a frame variant → cart → checkout with
 * delivery → online payment (sandbox provider, verified webhook) → staff process the order through
 * shipping and delivery → the customer sees each status update on the tracking page.
 * Requires the development seed (npm run db:seed) and PAYMENT_SANDBOX_ENABLED=true.
 */
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "owner@shams.example";
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? process.env.SEED_OWNER_PASSWORD ?? "";
if (!STAFF_PASSWORD) throw new Error("Set E2E_STAFF_PASSWORD (the seeded owner password) to run the acceptance tests");
const PHONE = "01055554444";

async function addInStockFrameToCart(page: Page) {
  await page.goto("/shop?instock=1&type=FRAME");
  await page.locator("article h3 a").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "أضف إلى السلة" }).click();
  await expect(page).toHaveURL(/\/cart$/);
}

test("customer buys online and staff fulfil the order end to end", async ({ page, browser }) => {
  await addInStockFrameToCart(page);
  await page.getByRole("link", { name: "إتمام الشراء" }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  await page.locator("input[name=contactName]").fill("عميل اختبار القبول");
  await page.locator("input[name=contactPhone]").fill(PHONE);
  await page.locator("select[name='address.governorate']").selectOption("القاهرة");
  await page.locator("input[name='address.city']").fill("مدينة نصر");
  await page.locator("input[name='address.street']").fill("شارع مكرم عبيد");
  await page.locator("input[name=shippingRateId]").first().check();
  await page.locator("input[name=paymentMethod][value=CARD]").check();
  await page.getByRole("button", { name: "المتابعة إلى الدفع" }).click();

  await expect(page).toHaveURL(/\/pay\/sandbox\//);
  await page.getByRole("button", { name: "محاكاة دفع ناجح" }).click();
  await expect(page).toHaveURL(/\/checkout\/result\?order=/);
  await expect(page.getByRole("heading", { name: /تم استلام طلبك/ })).toBeVisible();
  const number = new URL(page.url()).searchParams.get("order")!;
  expect(number).toMatch(/^SH-/);

  // Staff side, in a separate session.
  const staff = await (await browser.newContext()).newPage();
  await staff.goto("/admin/login");
  await staff.locator("input[name=email]").fill(STAFF_EMAIL);
  await staff.locator("input[name=password]").fill(STAFF_PASSWORD);
  await staff.locator("button[type=submit]").click();
  await expect(staff).toHaveURL(/\/admin$/);
  await staff.goto(`/admin/orders?q=${encodeURIComponent(number)}`);
  await staff.getByRole("link", { name: number }).click();
  await expect(staff.getByText("مدفوع").first()).toBeVisible();

  for (const status of ["قيد التجهيز", "جاهز", "تم الشحن", "تم التسليم"]) {
    const form = staff.locator("form", { has: staff.getByRole("button", { name: `نقل إلى: ${status}` }) });
    if (status === "تم الشحن") await form.locator("input[name=carrier]").fill("Bosta");
    await form.getByRole("button", { name: `نقل إلى: ${status}` }).click();
    // The button shows a pending label while the action runs; wait until it settles and disappears.
    await expect(staff.getByText("جارٍ الحفظ…")).toHaveCount(0);
    await expect(staff.getByRole("button", { name: `نقل إلى: ${status}` })).toHaveCount(0);
  }

  // Customer tracks the order by number + phone and sees the delivered status.
  await page.goto(`/track?number=${encodeURIComponent(number)}&phone=${PHONE}`);
  await expect(page.getByText(`${number} — تم التسليم`)).toBeVisible();
});

test("dashboard pages and admin APIs refuse anonymous access", async ({ page, request }) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login/);
  const exportRes = await request.get("/admin/export/orders?format=csv", { maxRedirects: 0 });
  expect([302, 303, 307, 401, 403]).toContain(exportRes.status());
});

test("webhooks with an invalid signature are rejected", async ({ request }) => {
  const res = await request.post("/api/webhooks/payments/sandbox", { data: { id: "evt_forged", type: "payment", status: "SUCCEEDED" }, headers: { "x-sandbox-signature": "forged" } });
  expect(res.status()).toBe(401);
});

test("visitors can switch to English and pick a light or dark theme", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "تغيير اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("link", { name: "All products" })).toBeVisible();

  // system → light → dark, kept after a reload.
  await page.getByRole("button", { name: "System theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
