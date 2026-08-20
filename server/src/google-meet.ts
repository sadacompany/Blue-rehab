import { config } from "./config.js";

/**
 * Google Meet integration using the free Google Calendar API.
 *
 * A single Google account (the clinic's Gmail) authorizes the platform once and
 * hands back a long-lived OAuth refresh token. From then on the server can mint a
 * real, unique Google Meet link for every remote session by creating a calendar
 * event with an attached conference. No paid Google Workspace plan is required —
 * the Calendar API is free.
 *
 * Secrets live only in server-side environment variables and never reach the
 * browser. When they are absent the whole module degrades gracefully to a no-op.
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_SESSION_MINUTES = 30;

export function isGoogleMeetConfigured(): boolean {
  return Boolean(
    config.GOOGLE_OAUTH_CLIENT_ID &&
      config.GOOGLE_OAUTH_CLIENT_SECRET &&
      config.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
}

export type MeetRequest = {
  summary: string;
  description?: string;
  startsAt: string;
  endsAt?: string | null;
  attendees?: string[];
};

export type MeetResult = {
  meetUrl: string;
  eventId: string;
  htmlLink: string;
};

type GoogleTokenResponse = { access_token?: string; error_description?: string };
type GoogleEventResponse = {
  id: string;
  htmlLink: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
};

// Neither Google call had a bound before this: a hang here ran out the clock
// on the whole request (see the comment on createMeeting's caller in
// runtime-api.ts — this path runs *after* a payment is already confirmed, so
// a stall here must not look like a failed payment to the user). 8s is
// generous for a single token or calendar-insert call and still leaves the
// rest of verifyPayment's 30s Vercel budget intact.
const GOOGLE_TIMEOUT_MS = 8_000;

async function fetchAccessToken(): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.GOOGLE_OAUTH_CLIENT_ID as string,
      client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET as string,
      refresh_token: config.GOOGLE_OAUTH_REFRESH_TOKEN as string,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(`google_token_failed_${response.status}:${payload.error_description ?? "unknown"}`);
  }
  return payload.access_token;
}

function generateRequestId(): string {
  return `blue-rehab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a calendar event carrying a Google Meet conference and return the link.
 * Throws when Google rejects the request; callers decide whether that is fatal.
 */
export async function createMeetEvent(request: MeetRequest): Promise<MeetResult> {
  if (!isGoogleMeetConfigured()) {
    throw new Error("google_meet_not_configured");
  }

  const accessToken = await fetchAccessToken();
  const startIso = new Date(request.startsAt).toISOString();
  const endIso = request.endsAt
    ? new Date(request.endsAt).toISOString()
    : new Date(new Date(startIso).getTime() + DEFAULT_SESSION_MINUTES * 60_000).toISOString();
  const timeZone = config.GOOGLE_MEET_TIME_ZONE;
  const calendarId = encodeURIComponent(config.GOOGLE_CALENDAR_ID);

  const url = `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: request.summary,
      description: request.description,
      start: { dateTime: startIso, timeZone },
      end: { dateTime: endIso, timeZone },
      attendees: (request.attendees ?? [])
        .filter((email) => email && email.includes("@"))
        .map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: generateRequestId(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`google_event_failed_${response.status}:${body.slice(0, 300)}`);
  }

  const event = (await response.json()) as GoogleEventResponse;
  const meetUrl =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;
  if (!meetUrl) {
    throw new Error("google_meet_link_missing");
  }
  return { meetUrl, eventId: event.id, htmlLink: event.htmlLink };
}
