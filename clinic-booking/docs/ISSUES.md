# سجل المشاكل وحلولها

| # | المشكلة | السبب الجذري | الحل | التحقق |
|---|---|---|---|---|
| 1 | أي مستخدم مسجل دخول (أو حتى زائر) كان يقدر يستدعي `claim_notifications` ويقرا بيانات المرضى | Supabase بيدي `EXECUTE` على أي دالة جديدة لـ `anon` و`authenticated` بشكل افتراضي، و`REVOKE ... FROM public` لوحده مش كفاية | `revoke all on all functions ... from public, anon, authenticated` وبعدين `grant` صريح لكل دالة | اختبار `is callable only by the service role` في `tests/db.test.ts`، وطلب REST حقيقي رجع `permission denied` |
| 2 | صفحة الحجز كانت بتفتح على يوم الجمعة مع إن الخميس فيه 17 ميعاد فاضي | الـ auto-advance في `SlotPicker` كان بيقرا قايمة مواعيد اليوم اللي قبله (فاضية) في نفس الـ render اللي اليوم اتغير فيه، فبيعدّي يوم زيادة | المواعيد بقت بتتخزن مع اليوم بتاعها `{date, slots}`، وأي قايمة مش لليوم الحالي بتتعامل على إنها لسه بتتحمل | اختبار e2e بيقارن اليوم المختار بأول يوم فيه مواعيد حسب الـ API |
| 3 | الأرقام كانت مختلطة (20 دقيقة / ٢٥٠ ج.م) | `Intl` بـ `ar-EG` بيطلع أرقام هندية، والباقي لاتيني | استخدام `ar-EG-u-nu-latn` في كل التنسيقات | Screenshots للـ e2e |
| 4 | `vercel.json` بـ cron كل 5 دقايق بيفشّل النشر على خطة Vercel المجانية | الخطة المجانية مش بتسمح بأكتر من cron واحد في اليوم | الجدولة بقت من Supabase `pg_cron` + `pg_net` (`supabase/cron.example.sql`) | — |
| 5 | `supabase start` فشل في تحميل `storage-api` (403/429 من الـ registry) | الخدمة مش مستخدمة أصلًا، والـ registry عامل rate limit | تعطيل storage وstudio وanalytics وedge_runtime في `supabase/config.toml` | `supabase start` اشتغل وطبّق الـ migration على Postgres 17 |
