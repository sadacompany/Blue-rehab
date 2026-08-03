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

## تكاملات خارجية متبقية

- اختيار بوابة الدفع واعتماد Checkout وWebhook الإنتاجي.
- اعتماد مزود الاجتماعات المرئية.
- اعتماد مزود SMS في Supabase Auth للإرسال الإنتاجي للـOTP.
