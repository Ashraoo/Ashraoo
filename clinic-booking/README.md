# عيادتي — نظام حجز مواعيد العيادات (النسخة الأولى)

نظام حجز للعيادات فيه:
- **صفحة حجز أونلاين** لكل عيادة (`/c/<الرابط>`): المريض يختار الخدمة واليوم والميعاد ويحجز من غير تسجيل.
- **صفحة الحجز للمريض** (`/b/<token>`): تفاصيل الحجز، وإلغاء، وتغيير الميعاد، وإضافة للتقويم (.ics).
- **داشبورد السكرتارية**: مواعيد اليوم، ودور الانتظار، والحجز بالتليفون، والكشف من غير ميعاد، وتغيير حالة الحجز، وتسجيل الدفع، وتحديث تلقائي (Realtime).
- **ملفات المرضى**: بحث بالاسم أو الموبايل، وسجل الزيارات، وملاحظات.
- **الإعدادات**: بيانات العيادة، والخدمات والأسعار، ومواعيد العمل (أكتر من فترة في اليوم)، والإجازات، وقواعد الحجز، ودعوة السكرتارية.
- **تذكيرات واتساب**: تأكيد الحجز، وتذكير قبل الميعاد بـ 24 ساعة وبساعتين، ورسالة عند تغيير الميعاد أو الإلغاء.

## التقنيات
Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS, Realtime) · WhatsApp Cloud API

## الأمان وسلامة البيانات
- **RLS على كل الجداول**: كل عيادة تشوف بياناتها هي بس. المالك بس اللي يعدل الإعدادات، والسكرتارية تدير المواعيد والمرضى.
- **المريض (anon) مالوش أي وصول للجداول**. كل حاجة بتعدي من دوال `public_*` المحددة.
- **منع الحجز المزدوج** بقيد `EXCLUDE` في قاعدة البيانات، فمستحيل يتحجز نفس الميعاد مرتين حتى لو اتنين حجزوا في نفس اللحظة.
- الميعاد المطلوب بيتأكد على السيرفر إنه من المواعيد المتاحة فعلًا، وفيه حد أقصى للحجوزات القائمة لكل رقم.
- صلاحيات الأعمدة: السكرتارية ماتقدرش تعدل `manage_token` ولا `booking_ref` ولا `clinic_id`.
- دوال الـ worker متاحة لـ `service_role` بس.

## التشغيل محليًا
المتطلبات: Node 20+، وDocker (عشان Supabase المحلي).

```bash
npm install
npx supabase start          # بيشغل Postgres + Auth + REST + Realtime ويطبق الـ migration
cp .env.example .env.local  # وحط فيه المفاتيح اللي ظهرت من الأمر اللي فوق
npm run dev                 # http://localhost:3000
```

## النشر (Production)
1. **Supabase**: اعمل مشروع جديد، وبعدين:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   - من **Authentication → URL Configuration**: حط `Site URL` = رابط موقعك، وضيف `https://your-domain.com/auth/callback` في Redirect URLs.
   - **سيب Confirm email مفعّل**، لأن دعوات السكرتارية بتعتمد على إن الإيميل متأكد.
2. **Vercel** (أو أي استضافة Next.js): ارفع المشروع، وحط متغيرات `.env.example` كلها.
3. **WhatsApp Cloud API**:
   - من Meta for Developers اعمل تطبيق Business، وضيف WhatsApp، وخد `WHATSAPP_TOKEN` (System User token دائم) و`WHATSAPP_PHONE_NUMBER_ID`.
   - اعمل الـ 4 Templates دول بالعربي (اللغة `ar`، والفئة Utility) واستنى الموافقة:

   | الاسم | النص المقترح |
   |---|---|
   | `booking_confirmation` | أهلًا {{1}}، تم تأكيد حجزك في {{2}} يوم {{3}} الساعة {{4}}. لتغيير الميعاد أو الإلغاء: {{5}} |
   | `appointment_reminder` | تذكير يا {{1}}: ميعادك في {{2}} يوم {{3}} الساعة {{4}}. لو مش هتقدر تيجي من فضلك ألغِ من هنا: {{5}} |
   | `appointment_rescheduled` | {{1}}، تم تغيير ميعادك في {{2}} ليوم {{3}} الساعة {{4}}. التفاصيل: {{5}} |
   | `appointment_cancelled` | {{1}}، تم إلغاء حجزك في {{2}} يوم {{3}} الساعة {{4}}. |

4. **تشغيل التذكيرات كل 5 دقايق**: فعّل `pg_cron` و`pg_net` في Supabase، وشغّل الملف [`supabase/cron.example.sql`](supabase/cron.example.sql) بعد ما تحط فيه الرابط والـ secret.
   (لو على Vercel Pro تقدر بدل كده تستخدم Vercel Cron على `/api/cron/reminders`. الخطة المجانية مش بتسمح بأكتر من cron واحد في اليوم.)

### الـ worker بيشتغل إزاي
`GET /api/cron/reminders` (محمي بـ `Authorization: Bearer $CRON_SECRET`):
بياخد الرسايل اللي ميعادها جه بـ `claim_notifications` (مع `FOR UPDATE SKIP LOCKED`، فمفيش رسالة بتتبعت مرتين)، ويبعتها، وبيسجل النتيجة. لو الإرسال فشل بيعيد المحاولة بفترات بتزيد (2، 4، 8… دقايق) لحد 5 محاولات. والتذكيرات اللي فات وقتها أو حجزها اتلغى بتتعلم "skipped".

## الاختبارات
```bash
npm run lint && npm run typecheck
npm test                                    # اختبارات الدوال المساعدة (+ قاعدة البيانات لو TEST_DATABASE_URL موجود)
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db   # الـ migration على Postgres حقيقي
npx supabase start && npm run build && npm start
npm run test:e2e                            # Playwright: التسجيل → إنشاء العيادة → الحجز → الداشبورد → الدفع
```

## هيكل المشروع
```
supabase/migrations/   الجداول وRLS والـ triggers والدوال
src/app/c/[slug]/      صفحة الحجز العامة
src/app/b/[token]/     صفحة إدارة الحجز للمريض + ملف .ics
src/app/dashboard/     داشبورد السكرتارية، والمرضى، والإعدادات
src/app/api/cron/      worker رسايل واتساب
src/lib/               Supabase clients، والوقت والمناطق الزمنية، والأرقام، والأخطاء، وواتساب
tests/ , e2e/          اختبارات Vitest وPlaywright
docs/ISSUES.md         سجل المشاكل وحلولها
```

## حدود النسخة دي (مقصودة)
- مفيش OTP على رقم المريض، لأنه محتاج مزود SMS مدفوع. بدلها فيه حد أقصى للحجوزات لكل رقم، وhoneypot ضد البوتات، والتأكيد بيوصل على واتساب.
- جدول مواعيد واحد لكل عيادة (دكتور واحد). أكتر من دكتور هيكون في المرحلة التالتة.
- فترات العمل لازم تخلص قبل نص الليل.
- الروشتة والتقارير والدفع الأونلاين في المراحل الجاية.
