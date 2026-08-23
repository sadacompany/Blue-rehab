import { AlertTriangle, CheckCircle2, LoaderCircle, Video, XCircle } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "../lib/format";
import { cancelMeetTest, createMeetTest, loadMeetTestSpecialists, type MeetTestResult } from "../lib/admin";
import { useAsync } from "../lib/use-async";

/**
 * A real Google Meet event, minted through the exact same code path a paid
 * remote booking uses, so a specialist and a tester can actually join with
 * their own Google accounts and confirm neither of them sits in the waiting
 * room forever.
 *
 * That deadlock was the bug: Meet links were being created with an empty
 * attendee list, so nobody joining was ever recognised as an invited guest —
 * both sides had to "ask to join", and with no one already inside able to
 * let them in, neither ever got past the lobby. The fix is that both the
 * specialist and the person testing are now on the calendar event's guest
 * list. This tool exists because that is not something provable by reading
 * code — it needs two real people, on two real Google accounts, actually
 * trying to get into the same room.
 */
export default function AdminMeetTest() {
  const { data: specialists, loading, error: loadError } = useAsync(loadMeetTestSpecialists, []);
  const [specialistId, setSpecialistId] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MeetTestResult | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  async function create() {
    setBusy(true);
    setError("");
    try {
      setResult(await createMeetTest(specialistId, testEmail));
      setCancelled(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إنشاء الاجتماع.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!result) return;
    setCancelling(true);
    try {
      await cancelMeetTest(result.eventId);
      setCancelled(true);
    } catch {
      // Not fatal — it's a ten-minute test event either way. The person can
      // delete it from Google Calendar directly if this happens to fail.
      setCancelled(true);
    } finally {
      setCancelling(false);
    }
  }

  return <section className="specialist-panel">
    <p className="application-hint" style={{ marginBottom: 16 }}>
      اختر أخصائياً وأدخل بريدك الإلكتروني (أو بريد أي شخص سيختبر الدخول)، ثم أنشئ اجتماعاً تجريبياً حقيقياً.
      افتح الرابط من حسابين مختلفين — حساب الأخصائي وحساب البريد الذي أدخلته — وتأكد أن كليهما يدخل مباشرة دون انتظار موافقة أحد.
    </p>

    {loading && <p className="application-hint"><LoaderCircle className="spin" /> جارٍ تحميل قائمة الأخصائيين…</p>}
    {loadError && <div className="form-error" role="alert">{loadError}</div>}

    {specialists && <form className="specialist-exercise-composer" onSubmit={(e) => { e.preventDefault(); void create(); }}>
      <label>
        <span>الأخصائي</span>
        <select value={specialistId} onChange={(e) => setSpecialistId(e.target.value)} required>
          <option value="" disabled>اختر أخصائياً</option>
          {specialists.map((s) => <option key={s.id} value={s.id} disabled={!s.hasEmail}>
            {s.displayName}{s.hasEmail ? "" : " — لا يوجد بريد مسجّل"}
          </option>)}
        </select>
      </label>
      <label>
        <span>البريد الإلكتروني للاختبار</span>
        <input type="email" placeholder="بريدك أو بريد من سيختبر الدخول" value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)} required />
      </label>
      {error && <p className="specialist-error"><AlertTriangle /> {error}</p>}
      <button className="button button-small" type="submit" disabled={busy || !specialistId || !testEmail}>
        {busy ? <LoaderCircle className="spin" /> : <Video />} {busy ? "جارٍ الإنشاء…" : "إنشاء اجتماع تجريبي"}
      </button>
    </form>}

    {result && <div className="admin-row" style={{ marginTop: 16 }}>
      <div className="admin-row-main">
        <div>
          <strong>اجتماع تجريبي مع {result.specialistName}</strong>
          <small>الموعد: {formatDateTime(result.startsAt)} (خلال ١٠ دقائق تقريباً)</small>
          <small>المدعوّون فعلياً في التقويم: {result.attendees.length ? result.attendees.join("، ") : "لا أحد — هذا يعني وجود مشكلة"}</small>
        </div>
        <em>{cancelled ? "أُلغي" : "جاهز"}</em>
      </div>
      <div className="admin-row-actions">
        {!cancelled && <a className="button button-small" href={result.meetingUrl} target="_blank" rel="noreferrer">
          <Video /> فتح رابط الاجتماع
        </a>}
        {!cancelled && <button className="button button-small button-ghost" type="button" disabled={cancelling} onClick={() => void cancel()}>
          {cancelling ? <LoaderCircle className="spin" /> : <XCircle />} إلغاء الاجتماع التجريبي
        </button>}
        {cancelled && <small className="application-hint"><CheckCircle2 /> أُلغي الاجتماع التجريبي.</small>}
      </div>
      <p className="application-hint" style={{ marginTop: 8 }}>
        افتح الرابط أعلاه من حساب Google الخاص بـ {result.specialistEmail}، وافتحه في متصفح آخر (أو جهاز آخر) مسجّلاً
        بحساب {result.testEmail}. إن دخل كلاهما مباشرة دون شاشة «طلب الانضمام» — المشكلة محلولة.
      </p>
    </div>}
  </section>;
}
