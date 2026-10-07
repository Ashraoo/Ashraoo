import { expect, test, type Page } from "@playwright/test";

const run = Date.now().toString(36);
const ownerEmail = `owner-${run}@example.com`;
const password = "test-password-123";
const slug = `e2e-${run}`;
const SHOTS = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Clicks open days in the strip until one has free slots, then picks the first slot. */
async function pickFirstSlot(page: Page, scope = page.locator("body")) {
  const days = scope.getByRole("group", { name: "الأيام" }).locator("button:not([disabled])");
  const count = await days.count();
  for (let i = 0; i < count; i++) {
    await days.nth(i).click();
    const slots = scope.getByRole("group", { name: "المواعيد المتاحة" }).getByRole("button");
    const empty = scope.getByText("مفيش مواعيد متاحة في اليوم ده");
    await expect(slots.first().or(empty)).toBeVisible();
    if (await slots.count()) {
      await slots.first().click();
      return;
    }
  }
  throw new Error("no free slots in the booking window");
}

async function bookOnline(page: Page, name: string, phone: string) {
  await page.goto(`/c/${slug}`);
  await expect(page.getByRole("heading", { name: "عيادة الاختبار" })).toBeVisible();
  await pickFirstSlot(page);
  await page.getByLabel("الاسم").fill(name);
  await page.getByLabel("رقم الموبايل (واتساب)").fill(phone);
  await page.getByRole("button", { name: "تأكيد الحجز" }).click();
  await expect(page).toHaveURL(/\/b\/[0-9a-f]{40}\?new=1/);
  await expect(page.getByText("تم الحجز بنجاح")).toBeVisible();
  return page.url().match(/\/b\/([0-9a-f]{40})/)![1];
}

test.describe.serial("clinic booking MVP", () => {
  test("owner signs up and creates the clinic", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("الإيميل").fill(ownerEmail);
    await page.getByLabel("كلمة السر").fill(password);
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByLabel("اسم العيادة").fill("عيادة الاختبار");
    await page.getByLabel("اسم الدكتور").fill("د. تجربة");
    await page.getByLabel("رابط الحجز").fill("Bad Slug");
    await page.getByRole("button", { name: "إنشاء العيادة" }).click();
    await expect(page.getByText("الرابط لازم يكون من 3")).toBeVisible();
    await page.getByLabel("رابط الحجز").fill(slug);
    await page.getByRole("button", { name: "إنشاء العيادة" }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\?welcome=1/);
    await expect(page.getByText("العيادة اتعملت")).toBeVisible();

    // set a price on the default service
    const card = (title: string) => page.locator("div.rounded-2xl", { has: page.getByRole("heading", { name: title, exact: true }) });
    const services = card("الخدمات");
    await services.locator("li", { hasText: /^كشف/ }).getByRole("button", { name: "تعديل" }).click();
    await services.getByLabel("السعر").fill("250");
    await services.getByRole("button", { name: "حفظ" }).click();
    await expect(services.getByText(/250/)).toBeVisible();

    // add Friday hours so the test finds slots on any day of the week
    const hours = card("مواعيد العمل");
    const friday = hours.locator("li", { hasText: "الجمعة" });
    await friday.getByRole("button", { name: "+ فترة" }).click();
    await friday.getByLabel("من").fill("08:00");
    await friday.getByLabel("إلى").fill("23:30");
    await friday.getByRole("button", { name: "إضافة" }).click();
    await expect(friday.getByText("08:00 – 23:30")).toBeVisible();
    await shot(page, "01-settings");
  });

  test("patient books online and manages the booking", async ({ page }) => {
    const token = await bookOnline(page, "مريض أونلاين", "01011112222");
    await expect(page.getByText("محجوز")).toBeVisible();
    await shot(page, "02-booking-confirmed");

    const ics = await page.request.get(`/b/${token}/calendar.ics`);
    expect(ics.status()).toBe(200);
    expect(await ics.text()).toContain("BEGIN:VEVENT");

    // second booking from another patient, then cancel it from the manage page
    await bookOnline(page, "مريض هيلغي", "01033334444");
    await page.getByRole("button", { name: "إلغاء الحجز" }).click();
    await page.getByRole("button", { name: "أيوه، ألغي" }).click();
    await expect(page.getByText("تم إلغاء الحجز.")).toBeVisible();
    await expect(page.getByText("ملغي")).toBeVisible();
    await expect(page.getByRole("button", { name: "إلغاء الحجز" })).toHaveCount(0);
  });

  test("reception runs the day", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("الإيميل").fill(ownerEmail);
    await page.getByLabel("كلمة السر").fill(password);
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // walk-in goes straight to the queue
    await page.getByRole("button", { name: "+ حجز جديد" }).click();
    await page.getByRole("button", { name: "كشف دلوقتي (بدون ميعاد)" }).click();
    await page.getByLabel("رقم الموبايل").fill("01055556666");
    await page.getByLabel("اسم المريض").fill("زائر بدون ميعاد");
    await page.getByRole("button", { name: "إضافة لدور الانتظار" }).click();
    const queue = page.locator("div", { has: page.getByRole("heading", { name: "دور الانتظار" }) }).last();
    await expect(queue.getByText("زائر بدون ميعاد")).toBeVisible();
    await queue.getByRole("button", { name: "دخّل" }).click();
    await expect(queue.getByText("في الكشف")).toBeVisible();

    // find the online booking: walk the days forward until it shows up
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      found = await page.getByText("مريض أونلاين").isVisible().catch(() => false);
      if (!found) {
        await page.getByRole("button", { name: "اليوم اللي بعده" }).click();
        await expect(page.getByText("بنحمّل…")).toHaveCount(0);
        found = await page.getByText("مريض أونلاين").isVisible();
      }
    }
    expect(found).toBe(true);
    const row = page.locator("li", { hasText: "مريض أونلاين" });
    await row.getByRole("button", { name: "وصل", exact: true }).click();
    await expect(row.getByText("وصل", { exact: true }).first()).toBeVisible();

    await row.getByRole("button", { name: "دفع" }).click();
    await expect(page.getByLabel("المبلغ")).toHaveValue("250");
    await page.getByRole("button", { name: "InstaPay" }).click();
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(row.getByText(/دفع 250/)).toBeVisible();

    await row.getByRole("button", { name: "دخل الكشف" }).click();
    await row.getByRole("button", { name: "خلص", exact: true }).click();
    await expect(row.getByText("خلص", { exact: true }).first()).toBeVisible();
    await shot(page, "03-reception");

    // patient file shows the visit and payment
    await page.getByRole("link", { name: "المرضى" }).click();
    await page.getByPlaceholder("ابحث بالاسم أو رقم الموبايل").fill("01011112222");
    await page.getByRole("button", { name: /مريض أونلاين/ }).click();
    await expect(page.getByRole("heading", { name: "سجل الزيارات" })).toBeVisible();
    await expect(page.locator("li", { hasText: "خلص" }).first()).toBeVisible();
    await shot(page, "04-patient");
  });

  test("public page works on a phone screen", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG", timezoneId: "Africa/Cairo" });
    const page = await ctx.newPage();
    await page.goto(`/c/${slug}`);
    await expect(page.getByRole("button", { name: "تأكيد الحجز" })).toBeVisible();
    // Opens on the first day that actually has free slots (regression: auto-advance skipped a day).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) {
      const rpc = (fn: string, body: object) =>
        page.request.post(`${supabaseUrl}/rest/v1/rpc/${fn}`, { headers: { apikey: anonKey }, data: body }).then((r) => r.json());
      const clinic = await rpc("public_get_clinic", { p_slug: slug });
      let firstDay: string | null = null;
      for (let i = 0; i <= 14 && !firstDay; i++) {
        const d = new Date(`${clinic.today}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        const day = d.toISOString().slice(0, 10);
        const slots = await rpc("public_get_slots", { p_slug: slug, p_service_id: clinic.services[0].id, p_date: day });
        if (slots.length) firstDay = day;
      }
      const selected = page.getByRole("group", { name: "الأيام" }).locator('button[aria-pressed="true"]');
      await expect(selected).toContainText(String(Number(firstDay!.slice(8))));
      await expect(page.getByRole("group", { name: "المواعيد المتاحة" }).getByRole("button").first()).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, "05-mobile");
    await ctx.close();
  });

  test("unknown clinic and booking pages 404", async ({ page }) => {
    expect((await page.goto("/c/does-not-exist-xyz"))!.status()).toBe(404);
    expect((await page.goto(`/b/${"0".repeat(40)}`))!.status()).toBe(404);
  });
});
