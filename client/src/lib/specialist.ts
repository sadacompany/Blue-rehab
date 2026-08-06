import type { DeliveryMode } from "./catalog-types";
import { AuthenticationRequiredError } from "./platform";
import { supabase } from "./supabase";

/** The signed-in user is authenticated but has no `specialists` row. */
export class NotASpecialistError extends Error {
  constructor() {
    super("NOT_A_SPECIALIST");
    this.name = "NotASpecialistError";
  }
}

export type SpecialistIdentity = {
  id: string;
  displayName: string;
  title: string;
  isVerified: boolean;
};

export type SessionNote = {
  id: string;
  bookingId: string;
  assessment: string;
  interventions: string;
  response: string;
  recommendations: string;
  completedAt: string | null;
};

export type SpecialistAppointment = {
  id: string;
  patientId: string;
  patientName: string;
  serviceName: string;
  startsAt: string;
  endsAt: string | null;
  mode: DeliveryMode;
  status: string;
  total: number | null;
  notes: string | null;
  meetingUrl: string | null;
  note: SessionNote | null;
};

export type Exercise = {
  id: string;
  name: string;
  description: string;
  repetitions: string;
  scheduleText: string;
  safetyInstructions: string;
  position: number;
};

export type TreatmentPlan = {
  id: string;
  patientId: string;
  patientName: string;
  diagnosisSummary: string;
  goals: string[];
  proposedSessions: number | null;
  durationWeeks: number | null;
  safetyInstructions: string;
  precautions: string;
  progressIndicators: string[];
  reviewAt: string | null;
  isPublished: boolean;
  updatedAt: string;
  exercises: Exercise[];
};

export type SpecialistDashboard = {
  specialist: SpecialistIdentity;
  appointments: SpecialistAppointment[];
  plans: TreatmentPlan[];
  /** Patients this specialist has seen — the candidates for a new plan. */
  patients: Array<{ id: string; name: string }>;
};

function firstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null;
}

async function requireUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AuthenticationRequiredError();
  return id;
}

/** Resolve the `specialists` row backing the signed-in account. */
export async function loadSpecialistIdentity(): Promise<SpecialistIdentity> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("specialists")
    .select("id,display_name,title,is_verified")
    .eq("profile_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotASpecialistError();
  return {
    id: data.id,
    displayName: data.display_name,
    title: data.title,
    isVerified: Boolean(data.is_verified),
  };
}

/**
 * Everything the dashboard renders, in one pass.
 *
 * Every read below is additionally constrained by RLS — the explicit
 * `specialist_id` filters are for index selectivity and readability, not for
 * access control. See supabase/migrations/20260804140000_specialist_dashboard.sql.
 */
export async function loadSpecialistDashboard(): Promise<SpecialistDashboard> {
  const specialist = await loadSpecialistIdentity();

  const [bookingsResult, plansResult, servicesResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("id,patient_id,service_id,starts_at,ends_at,mode,status,total,notes,meeting_url")
      .eq("specialist_id", specialist.id)
      .order("starts_at", { ascending: false })
      .limit(100),
    supabase
      .from("treatment_plans")
      .select("id,patient_id,diagnosis_summary,goals,proposed_sessions,duration_weeks,safety_instructions,precautions,progress_indicators,review_at,is_published,updated_at")
      .eq("specialist_id", specialist.id)
      .order("updated_at", { ascending: false }),
    supabase.from("services").select("id,name"),
  ]);

  const readError = firstError([bookingsResult, plansResult, servicesResult]);
  if (readError) throw new Error(readError.message);

  const bookings = bookingsResult.data ?? [];
  const plans = plansResult.data ?? [];

  const bookingIds = bookings.map((row) => row.id);
  const planIds = plans.map((row) => row.id);
  const patientIds = [...new Set([...bookings.map((r) => r.patient_id), ...plans.map((r) => r.patient_id)])];

  const [profilesResult, notesResult, exercisesResult] = await Promise.all([
    patientIds.length
      ? supabase.from("profiles").select("id,full_name").in("id", patientIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? supabase
          .from("session_notes")
          .select("id,booking_id,assessment,interventions,response,recommendations,completed_at")
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
    planIds.length
      ? supabase
          .from("exercises")
          .select("id,treatment_plan_id,name,description,repetitions,schedule_text,safety_instructions,position")
          .in("treatment_plan_id", planIds)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const joinError = firstError([profilesResult, notesResult, exercisesResult]);
  if (joinError) throw new Error(joinError.message);

  const names = new Map((profilesResult.data ?? []).map((row) => [row.id, row.full_name]));
  const serviceNames = new Map((servicesResult.data ?? []).map((row) => [row.id, row.name]));
  const notes = new Map(
    (notesResult.data ?? []).map((row) => [
      row.booking_id,
      {
        id: row.id,
        bookingId: row.booking_id,
        assessment: row.assessment ?? "",
        interventions: row.interventions ?? "",
        response: row.response ?? "",
        recommendations: row.recommendations ?? "",
        completedAt: row.completed_at,
      } satisfies SessionNote,
    ]),
  );

  const patientName = (id: string) => names.get(id) ?? "مريض غير معروف";

  const appointments: SpecialistAppointment[] = bookings.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: patientName(row.patient_id),
    serviceName: serviceNames.get(row.service_id) ?? "جلسة علاج طبيعي",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    mode: row.mode as DeliveryMode,
    status: row.status,
    total: row.total === null ? null : Number(row.total),
    notes: row.notes,
    meetingUrl: row.meeting_url,
    note: notes.get(row.id) ?? null,
  }));

  const treatmentPlans: TreatmentPlan[] = plans.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: patientName(row.patient_id),
    diagnosisSummary: row.diagnosis_summary ?? "",
    goals: row.goals ?? [],
    proposedSessions: row.proposed_sessions,
    durationWeeks: row.duration_weeks,
    safetyInstructions: row.safety_instructions ?? "",
    precautions: row.precautions ?? "",
    progressIndicators: row.progress_indicators ?? [],
    reviewAt: row.review_at,
    isPublished: Boolean(row.is_published),
    updatedAt: row.updated_at,
    exercises: (exercisesResult.data ?? [])
      .filter((exercise) => exercise.treatment_plan_id === row.id)
      .map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        description: exercise.description ?? "",
        repetitions: exercise.repetitions ?? "",
        scheduleText: exercise.schedule_text ?? "",
        safetyInstructions: exercise.safety_instructions ?? "",
        position: exercise.position,
      })),
  }));

  const patients = [...new Map(appointments.map((item) => [item.patientId, { id: item.patientId, name: item.patientName }])).values()];

  return { specialist, appointments, plans: treatmentPlans, patients };
}

export type SessionNoteInput = {
  assessment: string;
  interventions: string;
  response: string;
  recommendations: string;
};

/**
 * `session_notes.booking_id` is unique, so one note per session — upsert rather
 * than accumulating duplicates when the specialist edits during a visit.
 */
export async function saveSessionNote(
  bookingId: string,
  specialistId: string,
  input: SessionNoteInput,
): Promise<SessionNote> {
  const { data, error } = await supabase
    .from("session_notes")
    .upsert(
      {
        booking_id: bookingId,
        specialist_id: specialistId,
        assessment: input.assessment.trim() || null,
        interventions: input.interventions.trim() || null,
        response: input.response.trim() || null,
        recommendations: input.recommendations.trim() || null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "booking_id" },
    )
    .select("id,booking_id,assessment,interventions,response,recommendations,completed_at")
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    bookingId: data.booking_id,
    assessment: data.assessment ?? "",
    interventions: data.interventions ?? "",
    response: data.response ?? "",
    recommendations: data.recommendations ?? "",
    completedAt: data.completed_at,
  };
}

export type TreatmentPlanInput = {
  patientId: string;
  diagnosisSummary: string;
  goals: string[];
  proposedSessions: number | null;
  durationWeeks: number | null;
  safetyInstructions: string;
  precautions: string;
  isPublished: boolean;
};

export async function createTreatmentPlan(specialistId: string, input: TreatmentPlanInput) {
  const { data, error } = await supabase
    .from("treatment_plans")
    .insert({
      patient_id: input.patientId,
      specialist_id: specialistId,
      diagnosis_summary: input.diagnosisSummary.trim() || null,
      goals: input.goals,
      proposed_sessions: input.proposedSessions,
      duration_weeks: input.durationWeeks,
      safety_instructions: input.safetyInstructions.trim() || null,
      precautions: input.precautions.trim() || null,
      is_published: input.isPublished,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateTreatmentPlan(planId: string, input: Partial<TreatmentPlanInput>) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.diagnosisSummary !== undefined) patch.diagnosis_summary = input.diagnosisSummary.trim() || null;
  if (input.goals !== undefined) patch.goals = input.goals;
  if (input.proposedSessions !== undefined) patch.proposed_sessions = input.proposedSessions;
  if (input.durationWeeks !== undefined) patch.duration_weeks = input.durationWeeks;
  if (input.safetyInstructions !== undefined) patch.safety_instructions = input.safetyInstructions.trim() || null;
  if (input.precautions !== undefined) patch.precautions = input.precautions.trim() || null;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;

  const { error } = await supabase.from("treatment_plans").update(patch).eq("id", planId);
  if (error) throw new Error(error.message);
}

export type ExerciseInput = {
  name: string;
  description: string;
  repetitions: string;
  scheduleText: string;
  safetyInstructions: string;
};

export async function addExercise(planId: string, position: number, input: ExerciseInput) {
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      treatment_plan_id: planId,
      name: input.name.trim(),
      description: input.description.trim() || null,
      repetitions: input.repetitions.trim() || null,
      schedule_text: input.scheduleText.trim() || null,
      safety_instructions: input.safetyInstructions.trim() || null,
      position,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deleteExercise(exerciseId: string) {
  const { error } = await supabase.from("exercises").delete().eq("id", exerciseId);
  if (error) throw new Error(error.message);
}

/**
 * Attendance outcome for a finished session.
 *
 * Bookings are not directly updatable by `authenticated` — 20260804120000
 * revoked that so a patient could not re-price or self-confirm. The transition
 * runs inside a SECURITY DEFINER function that re-checks ownership and refuses
 * anything other than completed/no_show from a confirmed booking.
 */
export type OpenSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  mode: DeliveryMode;
  isAvailable: boolean;
};

/** Future slots on this specialist's own calendar, booked ones included. */
export async function loadMySlots(specialistId: string): Promise<OpenSlot[]> {
  const { data, error } = await supabase
    .from("availability_slots")
    .select("id,starts_at,ends_at,mode,is_available")
    .eq("specialist_id", specialistId)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    mode: row.mode as DeliveryMode,
    isAvailable: Boolean(row.is_available),
  }));
}

/**
 * Open appointment times.
 *
 * Availability had no interface at all — the seeded slots existed only because
 * they were inserted by script, so a newly approved specialist was unbookable.
 * Writes are allowed by `availability_specialist_all`, scoped to their own row.
 */
export async function openSlots(
  specialistId: string,
  input: { dates: string[]; times: string[]; mode: DeliveryMode; durationMinutes: number },
): Promise<number> {
  const rows = input.dates.flatMap((date) =>
    input.times.map((time) => {
      const start = new Date(`${date}T${time}:00`);
      return {
        specialist_id: specialistId,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + input.durationMinutes * 60_000).toISOString(),
        mode: input.mode,
        is_available: true,
      };
    }),
  ).filter((row) => new Date(row.starts_at) > new Date());

  if (!rows.length) return 0;

  const { error } = await supabase.from("availability_slots").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Withdraw a time that nobody has booked. */
export async function closeSlot(slotId: string) {
  const { error } = await supabase.from("availability_slots").delete().eq("id", slotId).eq("is_available", true);
  if (error) throw new Error(error.message);
}

export async function setAppointmentStatus(bookingId: string, status: "completed" | "no_show") {
  const { error } = await supabase.rpc("specialist_set_booking_status", {
    p_booking_id: bookingId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}
