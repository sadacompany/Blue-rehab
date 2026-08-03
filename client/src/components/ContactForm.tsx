"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  return <form className="contact-form" onSubmit={(event) => { event.preventDefault(); setSent(true); }}><div className="form-grid"><label><span>الاسم</span><input required placeholder="الاسم الكامل" /></label><label><span>البريد الإلكتروني</span><input required type="email" placeholder="name@example.com" dir="ltr" /></label><label><span>نوع الطلب</span><select><option>استفسار عام</option><option>مشكلة تقنية</option><option>شراكة أو تدريب</option><option>طلب خصوصية</option></select></label><label><span>رقم طلب سابق — اختياري</span><input placeholder="BR-0000" dir="ltr" /></label><label className="wide"><span>الرسالة</span><textarea required minLength={20} maxLength={1000} placeholder="صف الطلب بوضوح دون تضمين معلومات صحية أو ملفات حساسة." /></label></div><button className="button" type="submit"><Send /> اختبار النموذج</button>{sent && <div className="form-result"><CheckCircle2 /><span><strong>تم التحقق من النموذج محلياً.</strong><p>لم تُرسل الرسالة لأن قناة الدعم الرسمية لم تعتمد بعد. لا توجد بيانات محفوظة.</p></span></div>}</form>;
}

