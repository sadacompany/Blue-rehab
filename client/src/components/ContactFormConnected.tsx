import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { createSupportRequest } from "../lib/platform";

type FormState = { name: string; email: string; phone: string; subject: string; message: string };
const initialState: FormState = { name: "", email: "", phone: "", subject: "استفسار عام", message: "" };

export default function ContactFormConnected() {
  const [form, setForm] = useState<FormState>(initialState);
  const [sending, setSending] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const result = await createSupportRequest(form);
      setRequestId(result.id);
      setForm(initialState);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إرسال الطلب");
    } finally { setSending(false); }
  }

  return <form className="contact-form" onSubmit={(event) => void submit(event)}><div className="form-grid"><label><span>الاسم</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="الاسم الكامل" /></label><label><span>البريد الإلكتروني</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" dir="ltr" /></label><label><span>رقم الجوال — اختياري</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="05xxxxxxxx" dir="ltr" /></label><label><span>نوع الطلب</span><select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}><option>استفسار عام</option><option>مشكلة تقنية</option><option>شراكة أو تدريب</option><option>طلب خصوصية</option></select></label><label className="wide"><span>الرسالة</span><textarea required minLength={20} maxLength={1000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="صف الطلب بوضوح دون تضمين معلومات صحية أو ملفات حساسة." /></label></div><button className="button" type="submit" disabled={sending}>{sending ? <LoaderCircle className="spin" /> : <Send />} إرسال الطلب</button>{error && <div className="form-error" role="alert">{error}</div>}{requestId && <div className="form-result"><CheckCircle2 /><span><strong>تم تسجيل طلب الدعم.</strong><p>رقم الطلب: <b dir="ltr">{requestId}</b>. احتفظ به للمتابعة.</p></span></div>}</form>;
}
