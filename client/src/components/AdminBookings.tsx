import { CalendarDays } from "lucide-react";
import { bookingStatusLabel, formatCurrency, formatDateTime } from "../lib/format";
import type { AdminBooking } from "../lib/admin";

/** The booking ledger — read-only here, same as it always was. */
export default function AdminBookings({ bookings }: { bookings: AdminBooking[] }) {
  return <section className="specialist-panel">
    {bookings.length ? <div className="admin-list">
      {bookings.map((item) => <article key={item.id} className={`admin-row status-${item.status}`}>
        <div className="admin-row-main">
          <div>
            <strong>{item.patientName}</strong>
            <small>{item.serviceName} · {item.specialistName}</small>
            <small>{formatDateTime(item.startsAt)} · {item.mode === "remote" ? "عن بُعد" : "في المركز"}</small>
          </div>
          <em>{bookingStatusLabel(item.status)}{item.total !== null ? ` · ${formatCurrency(item.total)}` : ""}</em>
        </div>
      </article>)}
    </div> : <div className="portal-empty"><CalendarDays /><p>لا توجد حجوزات.</p></div>}
  </section>;
}
