# ربط Google Meet بالجلسات عن بُعد (مجانًا)

تولّد المنصة رابط **Google Meet** حقيقيًا لكل جلسة عن بُعد عبر **Google Calendar API**،
وهي واجهة مجانية تمامًا — لا حاجة لشراء اشتراك Google Workspace. يكفي حساب Gmail
واحد للعيادة يُصرّح للمنصة مرة واحدة، ثم يُنشئ الخادم موعدًا في التقويم مرفقًا برابط اجتماع.

> المفاتيح السرية تبقى في متغيرات البيئة على الخادم فقط ولا تصل إلى المتصفح.
> عند تركها فارغة يستمر الحجز في العمل، ويظهر للمستخدم أن الرابط سيصله قبل الموعد.

## المتغيرات المطلوبة

| المتغير | الوصف |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | معرّف عميل OAuth من Google Cloud |
| `GOOGLE_OAUTH_CLIENT_SECRET` | السر المقابل له |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | رمز تحديث طويل الأمد لحساب العيادة |
| `GOOGLE_CALENDAR_ID` | تقويم إنشاء المواعيد (الافتراضي `primary`) |
| `GOOGLE_MEET_TIME_ZONE` | المنطقة الزمنية (الافتراضي `Asia/Riyadh`) |

في الإنتاج تُضاف هذه القيم في Netlify: **Site settings → Environment variables**
(وليست في `netlify.toml` لأنها أسرار).

## خطوات الإعداد لمرة واحدة (~10 دقائق)

1. افتح [Google Cloud Console](https://console.cloud.google.com/) وأنشئ مشروعًا مجانيًا.
2. من **APIs & Services → Library** فعّل **Google Calendar API**.
3. من **OAuth consent screen** اختر النوع *External*، أضف بريد العيادة كـ *Test user*،
   وأضف النطاق `https://www.googleapis.com/auth/calendar.events`.
4. من **Credentials → Create credentials → OAuth client ID** اختر *Web application*،
   وأضف `https://developers.google.com/oauthplayground` كـ *Authorized redirect URI*.
   انسخ **Client ID** و**Client Secret**.
5. افتح [OAuth Playground](https://developers.google.com/oauthplayground/):
   - من الترس (⚙️) فعّل *Use your own OAuth credentials* وألصق الـ ID والـ Secret.
   - في الخطوة الأولى أدخِل النطاق `https://www.googleapis.com/auth/calendar.events`
     وأذِّن بحساب Gmail الخاص بالعيادة.
   - في الخطوة الثانية اضغط *Exchange authorization code for tokens* وانسخ **Refresh token**.
6. ضع القيم الثلاث في متغيرات البيئة (محليًا في `.env`، وفي الإنتاج داخل Netlify).

## كيف تعمل داخل المنصة

- بعد إنشاء حجز بوضع **remote**، يستدعي العميل `POST /api/bookings/:id/meet`.
- يتحقق الخادم من ملكية الحجز عبر جلسة المستخدم (JWT + سياسات RLS)، ثم ينشئ الرابط.
- يُحفظ الرابط على الحجز في العمود `meeting_url` (راجع مهاجرة قاعدة البيانات
  `20260803090000_booking_meeting_link.sql`) ويُعاد استخدامه إن طُلب مرة أخرى.
- يُرسل Google دعوة تقويم إلى بريد المستخدم تلقائيًا عند توفره.

## بديل بدون OAuth

إن رغبت لاحقًا في تبسيط أكبر، يمكن تخصيص رابط Meet دائم لكل أخصائي وتخزينه، وإعادة
استخدامه لكل جلساته. الطريقة الحالية (Calendar API) أفضل لأنها تنشئ رابطًا فريدًا
لكل جلسة مع دعوة تقويم ومطابقة للتوقيت.

---

## الجدولة التلقائية والدعوات

منذ ربط الدفع، صار إنشاء رابط الجلسة **تلقائياً** ولم يعد يحتاج طلباً منفصلاً:

- عند إنشاء أي حجز بطريقة **عن بُعد**، ينشئ الخادم حدثاً في تقويم Google مع مؤتمر
  Meet مرفق، ويحفظ الرابط في `bookings.meeting_url` مباشرة (`server/src/runtime-api.ts`).
- الحدث يُنشأ بـ `sendUpdates=all`، ما يعني أن **Google يرسل دعوة بالبريد الإلكتروني**
  إلى المريض تلقائياً — بدون أي مزود بريد مدفوع.
- فشل الجدولة لا يُفشل الحجز إطلاقاً؛ يبقى الموعد محفوظاً ويمكن توليد الرابط لاحقاً
  عبر `POST /api/bookings/:id/meet`.

### قنوات الدعوة الأخرى (بدون تكلفة)

| القناة | الآلية | التكلفة |
|---|---|---|
| البريد الإلكتروني | دعوة Google Calendar (`sendUpdates=all`) | مجانية |
| واتساب | رابط `wa.me` بنص جاهز — زر «إرسال التفاصيل عبر واتساب» | مجانية |
| التقويم | ملف `.ics` يُولَّد في المتصفح مع تذكير قبل ساعة | مجانية |

المنطق في `client/src/lib/invites.ts`. لا يتطلب أي منها واتساب Business API ولا
مزود بريد، وهو ما يحقق جزءاً من متطلب الإشعارات (القسم 15) بدون اشتراكات.
