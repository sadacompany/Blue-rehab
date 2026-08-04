import { createHash } from "node:crypto";
import { config } from "./config.js";
import { createMeetEvent, isGoogleMeetConfigured } from "./google-meet.js";

/**
 * Video links for remote sessions.
 *
 * Two providers, chosen with MEETING_PROVIDER:
 *
 * - **jitsi** (default) — needs no credentials at all. The room URL is derived
 *   from the booking, so there is nothing to create, nothing to authenticate,
 *   and no secret to leak or rotate. This is what makes remote sessions work out
 *   of the box.
 * - **google** — the Google Meet path via the Calendar API. Better recognised by
 *   patients and it emails a calendar invite, but it needs an OAuth client and a
 *   refresh token tied to a Google account.
 *
 * Verified against the live services on 2026-08-05:
 *   meet.jit.si   requires a moderator to LOG IN before a meeting can start, and
 *                 offers Google/GitHub/Facebook to do it — unusable here.
 *   8x8.vc        asks only for a display name. Run by 8x8 Inc., who maintain
 *                 Jitsi. This is the default.
 *   meet.ffmuc.net also anonymous, but a volunteer-funded community server.
 *
 * MEETING_JITSI_DOMAIN points this at any Jitsi deployment, so moving to a
 * self-hosted instance later is a one-variable change and no code edit.
 */

export type MeetingResult = {
  url: string;
  provider: "jitsi" | "google_meet";
  /** Calendar event id, when the provider creates one. */
  eventId?: string | null;
};

export type MeetingRequest = {
  bookingId: string;
  orderNumber?: string | null;
  startsAt: string;
  endsAt?: string | null;
  attendeeEmail?: string | null;
};

export function meetingProvider(): "jitsi" | "google" | "none" {
  const configured = config.MEETING_PROVIDER;
  if (configured === "none") return "none";
  if (configured === "google") return isGoogleMeetConfigured() ? "google" : "none";
  return "jitsi";
}

/** True when a remote booking can actually be given a link. */
export function isMeetingConfigured(): boolean {
  return meetingProvider() !== "none";
}

/**
 * Room name for a booking.
 *
 * Hashed rather than using the booking id directly: the room name travels in a
 * URL that gets shared over WhatsApp and email, and internal identifiers should
 * not ride along with it. The digest is deterministic, so asking twice returns
 * the same room, and 26 hex characters keep it unguessable — the only thing
 * standing between a stranger and a patient's consultation.
 */
function roomName(bookingId: string): string {
  const digest = createHash("sha256").update(`blue-rehab:${bookingId}`).digest("hex");
  return `blue-rehab-${digest.slice(0, 26)}`;
}

function jitsiUrl(bookingId: string): string {
  const domain = config.MEETING_JITSI_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // Arabic UI, and the pre-join screen so a patient can check camera and mic
  // before appearing in front of their specialist.
  const options = ['config.defaultLanguage="ar"', "config.prejoinPageEnabled=true"];
  return `https://${domain}/${roomName(bookingId)}#${options.join("&")}`;
}

export async function createMeeting(request: MeetingRequest): Promise<MeetingResult | null> {
  const provider = meetingProvider();
  if (provider === "none") return null;

  if (provider === "jitsi") {
    return { url: jitsiUrl(request.bookingId), provider: "jitsi", eventId: null };
  }

  const meeting = await createMeetEvent({
    summary: "جلسة بلو ريهاب عن بُعد",
    description: `رقم الحجز: ${request.bookingId}${request.orderNumber ? `\nرقم الطلب: ${request.orderNumber}` : ""}`,
    startsAt: request.startsAt,
    endsAt: request.endsAt ?? null,
    attendees: request.attendeeEmail ? [request.attendeeEmail] : [],
  });
  return { url: meeting.meetUrl, provider: "google_meet", eventId: meeting.eventId };
}
