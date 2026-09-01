# تشغيل مسار الحجز والدفع — الخطوات المتبقية

الكود كامل ومدموج في `main`. تبقى خطوتان تحتاجان صلاحيات لا يملكها إلا مالك المشروع.
للتحقق من الحالة في أي وقت:

```bash
bash scripts/verify-setup.sh
```

---

## 1) تطبيق الهجرة على قاعدة البيانات

يحتاج صلاحية تعديل المخطط (DDL). المفتاح العام (`publishable`) لا يستطيع ذلك.

**الأسهل — محرر SQL في Supabase:**

1. افتح مشروعك في Supabase ← **SQL Editor** ← **New query**.
2. انسخ كامل محتوى الملف:
   `supabase/migrations/20260804120000_booking_payment_flow.sql`
3. **Run**.

**أو عبر Supabase CLI:**

```bash
supabase link --project-ref <project-ref>
supabase db push
```

الهجرة مكتوبة لتكون قابلة لإعادة التشغيل (`if not exists` / `create or replace`).

> **ملاحظة:** إن كانت هناك حجوزات قديمة تشترك في نفس `slot_id`، سيفشل إنشاء الفهرس
> الفريد `bookings_slot_live_unique`. عالج التكرار أولاً ثم أعد التشغيل:
> ```sql
> select slot_id, count(*) from public.bookings
>  where slot_id is not null and status <> 'cancelled'
>  group by slot_id having count(*) > 1;
> ```

---

## 2) ضبط متغيرات البيئة في Netlify

**Site settings → Environment variables.** لا تكتبها في `netlify.toml` (يُرفع للمستودع).

| المتغير | القيمة | لماذا |
|---|---|---|
| `MOYASAR_SECRET_KEY` | `sk_test_…` | إنشاء الفواتير والتحقق. **سري** |
| `MOYASAR_PUBLISHABLE_KEY` | `pk_test_…` | مفتاح عام |
| `SUPABASE_SERVICE_ROLE_KEY` | من Supabase → API | لتسجيل نتيجة الدفع |
| `PUBLIC_SITE_URL` | `https://blorehab.com` | لبناء رابط العودة بعد الدفع |
| `VITE_AUTH_MODE` | `mock` | الوضع التجريبي للتحقق |

> ⚠️ **استخدم مفاتيح الاختبار.** المفاتيح التي تبدأ بـ `sk_live_` / `pk_live_` تخصم
> مبالغ حقيقية. وأي مفتاح سري ظهر في محادثة أو لقطة شاشة يجب **تدويره فوراً**.

---

## 3) إعداد Supabase للوضع التجريبي

Authentication → Providers → Email → **Confirm email = off**، وإلا لن تُفتح الجلسة
مباشرة بعد إنشاء الحساب التجريبي.

---

## التحقق النهائي

```bash
npm run dev
bash scripts/verify-setup.sh
```

المتوقع: أول ثلاثة فحوص ✓، والرابع يبقى تحذيراً مقصوداً ما دام الوضع التجريبي مفعّلاً.

ثم جرّب المسار كاملاً: `/login` ← الرمز الثابت ← `/booking` ← «ادفع» ←
بطاقة الاختبار `4111111111111111` ← العودة إلى `/payment/callback`.

---

## قبل الإطلاق الحقيقي

- [ ] `VITE_AUTH_MODE=sms` + ربط مزود رسائل في Supabase
- [ ] حذف الحسابات التجريبية `@otp.blue-rehab.local`
- [ ] مفاتيح مُيسّر الحقيقية بعد اكتمال الاختبار
- [ ] إضافة webhook من مُيسّر (حتى لا يعتمد التأكيد على عودة المستخدم للمتصفح)
- [ ] إعادة مزامنة ملفات الهجرة مع القاعدة الحيّة (`supabase db pull`)
