// Renders listing images (Etsy/Gumroad) and video scene stills from real product screenshots.
// Usage: node render.js   (needs playwright + chromium; screenshots in ./screens)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const OUT_IMG = path.join(DIR, "images");
const OUT_SCN = path.join(DIR, "video", "scenes");
const img = (lang, name) =>
  "data:image/png;base64," + fs.readFileSync(path.join(DIR, "screens", `${lang}-${name}.png`)).toString("base64");

const C = { dark: "#0F4C5C", accent: "#1B998B", gold: "#C9A227", cream: "#FBF7EC", ink: "#14232B" };

const TXT = {
  en: {
    dir: "ltr", font: "'Inter', sans-serif",
    badge: "2027 EDITION",
    heroT: "2027 Budget, Goals<br>& Ramadan Planner",
    heroS: "An automated finance dashboard for Google Sheets & Excel",
    chips: ["Auto-calculating", "Google Sheets + Excel", "Instant download"],
    s: [
      { k: "dashboard", t: "Your whole year<br>at a glance", d: "Income, expenses, net savings and your savings rate vs. target, updated automatically." },
      { k: "ramadan", t: "Ramadan planner<br>+ zakat calculator", d: "Ramadan budget vs. actual, nisab from today's gold price, and a 30-day tracker." },
      { k: "goals", t: "Know exactly what<br>to save each month", d: "Umrah, emergency fund, a new laptop: progress, months left and the monthly amount you need." },
      { k: "transactions", t: "Log it in 5 seconds.<br>Everything else is automatic.", d: "Date, category from a dropdown, amount. Type, month and Ramadan flag fill themselves in." },
    ],
    incT: "What's included",
    inc: [["Dashboard", "6 KPIs, monthly table, 2 charts"], ["Transactions", "1,000 rows with dropdowns"],
      ["Categories & Budget", "35 categories, plan vs. actual"], ["Goals", "10 goals with monthly targets"],
      ["Ramadan", "Budget, zakat calculator, 30-day tracker"], ["Start Here", "Settings & quick-start guide"]],
    incF: "Works in Google Sheets & Excel · Any currency · No subscription",
    ctaT: "Plan 2027 the smart way", ctaS: "Instant download · Google Sheets & Excel",
  },
  ar: {
    dir: "rtl", font: "'Cairo', sans-serif",
    badge: "إصدار 2027",
    heroT: "مخطط الميزانية والأهداف<br>ورمضان 2027",
    heroS: "لوحة تحكم مالية تلقائية على <bdi>Google Sheets</bdi> و <bdi>Excel</bdi>",
    chips: ["حسابات تلقائية", "<bdi>Google Sheets + Excel</bdi>", "تحميل فوري"],
    s: [
      { k: "dashboard", t: "سنتك كلها<br>في صفحة واحدة", d: "الدخل والمصروف وصافي الادخار ونسبة الادخار مقابل هدفك، بتتحدّث لوحدها." },
      { k: "ramadan", t: "مخطط رمضان<br>+ حاسبة الزكاة", d: "ميزانية رمضان مقابل الفعلي، النصاب من سعر الذهب، ومتابعة 30 يوم." },
      { k: "goals", t: "اعرف هتحوّش كام<br>كل شهر", d: "عمرة، صندوق طوارئ، جهاز جديد: التقدّم والشهور المتبقية والمبلغ الشهري المطلوب." },
      { k: "transactions", t: "سجّل في 5 ثواني<br>والباقي تلقائي", d: "التاريخ والفئة من القائمة والمبلغ. النوع والشهر وعلامة رمضان بيتحسبوا لوحدهم." },
    ],
    incT: "إيه اللي هتستلمه",
    inc: [["لوحة التحكم", "6 مؤشرات + جدول شهري + رسمين"], ["المعاملات", "1000 سطر بقوائم منسدلة"],
      ["الفئات والميزانية", "35 فئة، المخطط مقابل الفعلي"], ["الأهداف", "10 أهداف بالمطلوب شهرياً"],
      ["رمضان", "ميزانية + حاسبة زكاة + متابعة 30 يوم"], ["ابدأ هنا", "الإعدادات وطريقة الاستخدام"]],
    incF: "بيشتغل على <bdi>Google Sheets</bdi> و <bdi>Excel</bdi> · أي عملة · من غير اشتراك",
    ctaT: "خطّط لـ 2027 صح", ctaS: "تحميل فوري · <bdi>Google Sheets</bdi> و <bdi>Excel</bdi>",
  },
};

const base = (t, w, h, body) => `<!doctype html><html dir="${t.dir}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:${t.font};color:${C.ink};
 background:radial-gradient(circle at 85% 10%,#E3F2EF 0,transparent 45%),radial-gradient(circle at 10% 95%,#F6EDD3 0,transparent 40%),${C.cream}}
.badge{display:inline-block;background:${C.gold};color:#fff;font-weight:800;letter-spacing:.06em;border-radius:999px}
h1{color:${C.dark};font-weight:800;line-height:1.12}
.sub{color:#4A5A61;font-weight:600}
.frame{background:#fff;border-radius:22px;box-shadow:0 30px 80px rgba(15,76,92,.25),0 4px 14px rgba(0,0,0,.08);overflow:hidden;border:1px solid #E1E6E8}
.bar{height:44px;background:#EEF2F3;display:flex;align-items:center;gap:10px;padding:0 18px;direction:ltr}
.bar i{width:13px;height:13px;border-radius:50%;display:block}
.frame img{display:block;width:100%}
.chip{display:inline-flex;align-items:center;gap:10px;background:#fff;border:2px solid ${C.accent};color:${C.dark};font-weight:700;border-radius:999px}
.chip:before{content:"✓";color:#fff;background:${C.accent};border-radius:50%;display:inline-flex;align-items:center;justify-content:center}
.dots{position:absolute;opacity:.5}
</style></head><body>${body}</body></html>`;

const frame = (src, extra = "") =>
  `<div class="frame" style="${extra}"><div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div><img src="${src}"></div>`;

const chips = (t, fs) => t.chips.map((c) =>
  `<span class="chip" style="font-size:${fs}px;padding:${fs * 0.5}px ${fs * 1.1}px"><style>.chip:before{width:${fs * 1.2}px;height:${fs * 1.2}px;font-size:${fs * 0.7}px}</style>${c}</span>`).join("");

// ---------- listing images 2000x1500 ----------
function hero(t, lang, w = 2000, h = 1500) {
  const sq = w === h;
  return base(t, w, h, `
  <div style="position:absolute;inset:0;padding:${sq ? 90 : 110}px;display:flex;flex-direction:column">
    <div><span class="badge" style="font-size:30px;padding:12px 30px">${t.badge}</span></div>
    <h1 style="font-size:${sq ? 92 : 104}px;margin-top:30px">${t.heroT}</h1>
    <p class="sub" style="font-size:${sq ? 38 : 42}px;margin-top:22px">${t.heroS}</p>
    <div style="display:flex;gap:18px;margin-top:34px;flex-wrap:wrap">${chips(t, sq ? 28 : 30)}</div>
  </div>
  ${frame(img(lang, "dashboard"), `position:absolute;${t.dir === "rtl" ? "left" : "right"}:${sq ? -80 : -60}px;bottom:${sq ? -60 : -80}px;width:${sq ? 1000 : 1150}px;transform:rotate(${t.dir === "rtl" ? 2 : -2}deg)`)}
  ${frame(img(lang, "ramadan"), `position:absolute;${t.dir === "rtl" ? "left" : "right"}:${sq ? 760 : 1000}px;bottom:${sq ? -140 : -170}px;width:${sq ? 560 : 640}px;transform:rotate(${t.dir === "rtl" ? -3 : 3}deg)`)}
  `);
}

function feature(t, lang, i, w = 2000, h = 1500) {
  const s = t.s[i];
  return base(t, w, h, `
  <div style="position:absolute;inset:0;padding:100px 110px;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:22px">
      <span style="font-size:34px;font-weight:800;color:#fff;background:${C.accent};width:66px;height:66px;border-radius:50%;display:flex;align-items:center;justify-content:center">${i + 1}</span>
      <h1 style="font-size:78px">${s.t.replace("<br>", " ")}</h1>
    </div>
    <p class="sub" style="font-size:38px;margin-top:24px;max-width:1650px">${s.d}</p>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;margin-top:50px;min-height:0">
      <div class="frame" style="max-height:100%;max-width:100%;display:flex;flex-direction:column">
        <div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
        <img src="${img(lang, s.k)}" style="max-height:1000px;width:auto;max-width:1780px;object-fit:contain">
      </div>
    </div>
  </div>`);
}

function included(t, lang, w = 2000, h = 1500) {
  const icons = ["📊", "🧾", "🗂️", "🎯", "🌙", "⚙️"];
  const cards = t.inc.map(([a, b], i) => `
    <div style="background:#fff;border-radius:28px;padding:56px 52px;box-shadow:0 14px 40px rgba(15,76,92,.12);border-top:10px solid ${i === 4 ? C.gold : C.accent};display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:84px;line-height:1">${icons[i]}</div>
      <div style="font-size:54px;font-weight:800;color:${C.dark};margin-top:26px">${a}</div>
      <div style="font-size:36px;color:#4A5A61;margin-top:14px;font-weight:600;line-height:1.35">${b}</div>
    </div>`).join("");
  return base(t, w, h, `
  <div style="position:absolute;inset:0;padding:100px 110px;display:flex;flex-direction:column">
    <h1 style="font-size:96px;text-align:center">${t.incT}</h1>
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:40px;margin:60px 0">${cards}</div>
    <div style="text-align:center;font-size:40px;font-weight:700;color:#fff;background:${C.dark};border-radius:999px;padding:30px 40px">${t.incF}</div>
  </div>`);
}

// ---------- video scenes ----------
function scene(t, lang, kind, i, w, h) {
  const v = h > w; // vertical
  if (kind === "hero") {
    return base(t, w, h, `
    <div style="position:absolute;inset:0;padding:${v ? "120px 70px" : "90px 100px"};display:flex;flex-direction:column;${v ? "align-items:center;text-align:center" : ""}">
      <div><span class="badge" style="font-size:${v ? 34 : 26}px;padding:12px 30px">${t.badge}</span></div>
      <h1 style="font-size:${v ? 92 : 80}px;margin-top:30px">${t.heroT}</h1>
      <p class="sub" style="font-size:${v ? 40 : 34}px;margin-top:22px">${t.heroS}</p>
    </div>
    ${frame(img(lang, "dashboard"), v ? "position:absolute;left:60px;right:60px;top:820px"
      : `position:absolute;${t.dir === "rtl" ? "left" : "right"}:-40px;top:440px;width:1000px;transform:rotate(${t.dir === "rtl" ? 2 : -2}deg)`)}`);
  }
  if (kind === "cta") {
    return base(t, w, h, `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px;background:${C.dark}">
      <span class="badge" style="font-size:${v ? 34 : 28}px;padding:12px 30px">${t.badge}</span>
      <h1 style="font-size:${v ? 110 : 100}px;margin-top:36px;color:#fff">${t.ctaT}</h1>
      <p style="font-size:${v ? 44 : 38}px;margin-top:28px;color:#BFE3DD;font-weight:600">${t.ctaS}</p>
      <div style="display:flex;gap:18px;margin-top:50px;flex-wrap:wrap;justify-content:center">${chips(t, v ? 32 : 28)}</div>
    </div>`);
  }
  const s = t.s[i];
  return base(t, w, h, `
  <div style="position:absolute;inset:0;padding:${v ? "130px 60px 80px" : "70px 90px"};display:flex;flex-direction:column;${v ? "text-align:center" : ""}">
    <h1 style="font-size:${v ? 88 : 66}px">${v ? s.t : s.t.replace("<br>", " ")}</h1>
    <p class="sub" style="font-size:${v ? 40 : 32}px;margin-top:20px">${s.d}</p>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;margin-top:40px;min-height:0">
      <div class="frame"><div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
      <img src="${img(lang, s.k)}" style="max-height:${v ? 1150 : 760}px;width:auto;max-width:${v ? 960 : 1740}px;object-fit:contain"></div>
    </div>
  </div>`);
}

(async () => {
  fs.mkdirSync(OUT_IMG, { recursive: true });
  fs.mkdirSync(OUT_SCN, { recursive: true });
  const browser = await chromium.launch();
  const shot = async (html, w, h, file) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, type: file.endsWith(".jpg") ? "jpeg" : "png", quality: file.endsWith(".jpg") ? 92 : undefined });
    await page.close();
    console.log(path.relative(DIR, file));
  };
  for (const lang of ["en", "ar"]) {
    const t = TXT[lang];
    await shot(hero(t, lang), 2000, 1500, path.join(OUT_IMG, `${lang}-01-cover.jpg`));
    for (let i = 0; i < 4; i++) await shot(feature(t, lang, i), 2000, 1500, path.join(OUT_IMG, `${lang}-0${i + 2}-${t.s[i].k}.jpg`));
    await shot(included(t, lang), 2000, 1500, path.join(OUT_IMG, `${lang}-06-included.jpg`));
    await shot(hero(t, lang, 1600, 1600), 1600, 1600, path.join(OUT_IMG, `${lang}-thumbnail-square.jpg`));
    for (const [w, h, tag] of [[1920, 1080, "landscape"], [1080, 1920, "vertical"]]) {
      const kinds = [["hero"], ["f", 0], ["f", 1], ["f", 2], ["f", 3], ["cta"]];
      for (let n = 0; n < kinds.length; n++) {
        const [k, i] = kinds[n];
        await shot(scene(t, lang, k, i, w, h), w, h, path.join(OUT_SCN, `${lang}-${tag}-${n}.png`));
      }
    }
  }
  await browser.close();
})();
