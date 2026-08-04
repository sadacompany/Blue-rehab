/**
 * Session invitations.
 *
 * Google Calendar already emails the invite to the patient when the event is
 * created with `sendUpdates=all` (free, part of the Calendar API). These helpers
 * cover the two channels that need no paid provider at all:
 *
 * - **WhatsApp** via a `wa.me` share link — no WhatsApp Business API, no cost.
 * - **Calendar file** via a locally generated `.ics`, for any other calendar app.
 */

export type SessionInvite = {
  bookingId: string;
  startsAt: string;
  endsAt?: string | null;
  serviceName: string;
  specialistName: string;
  meetingUrl?: string | null;
  isRemote: boolean;
  branchName?: string | null;
};

const DEFAULT_MINUTES = 30;

function formatArabicDateTime(iso: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso));
}

/** Human-readable invitation text, shared across WhatsApp and the calendar file. */
export function inviteMessage(invite: SessionInvite): string {
  const lines = [
    "تأكيد جلسة — منصة بلو للتأهيل",
    "",
    `الخدمة: ${invite.serviceName}`,
    `المختص: ${invite.specialistName}`,
    `الموعد: ${formatArabicDateTime(invite.startsAt)}`,
    invite.isRemote ? "طريقة الجلسة: عن بُعد" : `طريقة الجلسة: في المركز${invite.branchName ? ` — ${invite.branchName}` : ""}`,
  ];
  if (invite.isRemote && invite.meetingUrl) lines.push(`رابط الجلسة: ${invite.meetingUrl}`);
  lines.push("", `رقم الحجز: ${invite.bookingId}`);
  return lines.join("\n");
}

/** `wa.me` link that opens WhatsApp with the invitation pre-filled. */
export function whatsappShareUrl(invite: SessionInvite, phone?: string): string {
  const text = encodeURIComponent(inviteMessage(invite));
  const digits = phone?.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

function toIcsStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Build an RFC 5545 calendar entry for any calendar app. */
export function buildIcs(invite: SessionInvite): string {
  const start = toIcsStamp(invite.startsAt);
  const end = toIcsStamp(
    invite.endsAt ?? new Date(new Date(invite.startsAt).getTime() + DEFAULT_MINUTES * 60_000).toISOString(),
  );
  const location = invite.isRemote ? (invite.meetingUrl ?? "جلسة عن بُعد") : (invite.branchName ?? "مركز بلو للتأهيل");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blue Rehab//Booking//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${invite.bookingId}@blue-rehab`,
    `DTSTAMP:${toIcsStamp(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(`${invite.serviceName} — ${invite.specialistName}`)}`,
    `DESCRIPTION:${escapeIcsText(inviteMessage(invite))}`,
    `LOCATION:${escapeIcsText(location)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    "DESCRIPTION:تذكير بجلسة بلو للتأهيل",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Trigger a download of the `.ics` file for this session. */
export function downloadIcs(invite: SessionInvite) {
  const blob = new Blob([buildIcs(invite)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `blue-rehab-${invite.bookingId.slice(0, 8)}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
