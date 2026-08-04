# Blue Rehab — بلو ريهاب

منصة عربية متجاوبة لجلسات العلاج الطبيعي والتأهيل الرياضي والدورات المهنية.

## التقنية

- React 19 + Vite + TypeScript، دون Next.js.
- Supabase لقاعدة PostgreSQL والمصادقة والتخزين وسياسات RLS.
- Node.js + Express + TypeScript للتطوير المحلي.
- Netlify Functions لواجهات API العامة في الإنتاج.
- CSS عربي RTL وMobile First ودعم `prefers-reduced-motion`.

## المسارات المتصلة فعليًا

- الخدمات والمختصون والدورات والمواعيد تُقرأ مباشرة من Supabase.
- تسجيل الدخول برقم الجوال عبر Supabase OTP.
- الحجز ينشئ سجلًا فعليًا مرتبطًا بالمستخدم، وتتحقق قاعدة البيانات من الخدمة والمختص والموعد والسعر قبل الحفظ.
- التسجيل في الدورة ينشئ Enrollment فعليًا، مع إنشاء سجل الدفع تلقائيًا.
- لوحة الحساب تعرض الحجوزات والدورات والمدفوعات والإشعارات الخاصة بالمستخدم وفق RLS.
- نموذج التواصل ينشئ Support Request فعليًا ويعرض رقم الطلب.
- تفاصيل الدورة والوحدات والدروس تستخدم أسماء الأعمدة الحالية في قاعدة البيانات.
- `/api/health` و`/api/catalog` و`/api/courses/:slug` تعمل عبر Netlify Function مستقلة.
- مسارات React الفرعية تعمل عند الفتح المباشر أو تحديث الصفحة.

كل اسم أو موعد أو سعر غير معتمد موسوم بوضوح بأنه توضيحي.

## التشغيل محليًا

```bash
npm install
cp .env.example .env
npm run dev
```

- React: `http://localhost:5173`
- API: `http://localhost:4000`
- صحة الخدمة: `http://localhost:4000/api/health`

قيم Supabase العامة الحالية موجودة كإعداد افتراضي ويمكن استبدالها عند نقل المنصة إلى مشروع آخر. لا يوجد Service Role Key في الواجهة أو Netlify.

## النشر على Netlify

يقرأ Netlify الإعدادات من `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `client/dist`
- Functions directory: `netlify/functions`
- Node.js: الإصدار 20

تُوجّه `/api/*` إلى Netlify Function قبل SPA fallback إلى `index.html`.

بعد النشر اختبر:

- `/services`
- `/courses`
- `/booking`
- `/portal`
- `/api/health`
- `/api/catalog`

الاستجابة المتوقعة من `/api/health`:

```json
{
  "status": "ok",
  "service": "blue-rehab-api",
  "catalog": "supabase",
  "protectedWrites": "authenticated-rls"
}
```

## Supabase

قاعدة الإنتاج تحتوي على 33 جدولًا عامًا مع RLS. تشمل الحجوزات والجلسات والخطط والتمارين والدورات والمدفوعات والاستردادات والإشعارات والدعم والتدقيق.

التخزين الخاص:

- `medical-files`
- `course-materials`

جميع تغييرات المخطط والسياسات محفوظة داخل `supabase/migrations`.

## التحقق

```bash
npm run lint
npm run build
```

يشغّل GitHub Actions التحقق آليًا لكل Pull Request ولكل Push إلى `main`، ويتحقق أيضًا من Netlify Functions.

## الجلسات عن بُعد عبر Google Meet

تُنشئ المنصة رابط Google Meet حقيقيًا لكل جلسة عن بُعد باستخدام Google Calendar API
المجانية (لا حاجة لاشتراك Google Workspace). المفاتيح السرية تُضبط في متغيرات البيئة
على الخادم فقط، وعند غيابها يستمر الحجز في العمل دون رابط. دليل الإعداد الكامل في
[`docs/google-meet.md`](docs/google-meet.md).

## تكاملات خارجية متبقية

- ✅ بوابة الدفع: مُيسّر بفواتير مستضافة (يتبقى Webhook الإنتاجي).
- ✅ مزود الاجتماعات المرئية: Google Meet عبر Calendar API (انظر أعلاه).
- اعتماد مزود SMS في Supabase Auth للإرسال الإنتاجي للـOTP.

## الهوية البصرية

مرجع ألوان الهوية والخطوط والشعار في [`docs/BRAND.md`](docs/BRAND.md). توكنز الألوان
في `client/src/styles/tokens.css` مطابقة لألوان الهوية الأربعة المعتمدة.

## الدفع والتحقق

- **الدفع:** بوابة مُيسّر بفواتير مستضافة — [`docs/payments-moyasar.md`](docs/payments-moyasar.md).
  المبلغ يُحسب في قاعدة البيانات ولا يأتي من المتصفح، والتحقق يتم من جهة الخادم.
- **رمز التحقق (OTP):** وضع تجريبي برمز ثابت ظاهر إلى حين ربط مزود الرسائل —
  [`docs/otp-mock.md`](docs/otp-mock.md). **يجب** تعطيله قبل الإطلاق.

جميع المفاتيح تُقرأ من متغيرات البيئة. راجع `.env.example`، ولا تُودع أي مفتاح سري
في المستودع.

## التشغيل — الخطوات المتبقية

خطوات التفعيل (تطبيق الهجرة وضبط مفاتيح البيئة) في [`docs/SETUP.md`](docs/SETUP.md).
للتحقق من الحالة:

```bash
bash scripts/verify-setup.sh
```

## المراجعة والفجوات

تقرير مراجعة المنصة مقابل وثيقة المتطلبات في [`docs/APP_REVIEW.md`](docs/APP_REVIEW.md).
