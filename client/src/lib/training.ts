import { supabase } from "./supabase";

/**
 * Clinical summer training — التدريب الصيفي الإكلينيكي.
 *
 * Students applying to train in the clinics are not patients and have no reason
 * to hold an account, so the form is open. Everything here writes; nothing here
 * reads back. An applicant cannot list applications, including their own —
 * there is no identity to scope such a read to.
 *
 * The CV upload is deliberately second: the application row is created first and
 * the file goes into a folder named after it, which is what the storage policy
 * checks. A failed upload therefore loses the attachment, never the application.
 */

export type TrainingApplicationInput = {
  fullName: string;
  phone: string;
  email: string;
  university: string;
  college: string;
  specialty: string;
  academicLevel: string;
  studentNumber: string;
  availableFrom: string;
  availableTo: string;
  requiredHours: string;
  note: string;
};

const ERRORS: Record<string, string> = {
  NAME_REQUIRED: "الاسم الكامل مطلوب.",
  PHONE_REQUIRED: "رقم الجوال مطلوب.",
  UNIVERSITY_REQUIRED: "اسم الجامعة مطلوب.",
  SPECIALTY_REQUIRED: "التخصص مطلوب.",
  ALREADY_APPLIED: "لديك طلب قيد النظر بهذا الرقم. سنتواصل معك عند توفر مقعد تدريب.",
  ATTACH_NOT_ALLOWED: "تعذر إرفاق الملف بهذا الطلب.",
};

function translate(message: string): string {
  const code = Object.keys(ERRORS).find((key) => message.includes(key));
  return code ? ERRORS[code] : message;
}

/** Returns the new application id, so the CV can be filed against it. */
export async function submitTrainingApplication(input: TrainingApplicationInput): Promise<string> {
  const { data, error } = await supabase.rpc("submit_training_application", {
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_university: input.university,
    p_specialty: input.specialty,
    p_email: input.email || null,
    p_college: input.college || null,
    p_academic_level: input.academicLevel || null,
    p_student_number: input.studentNumber || null,
    p_available_from: input.availableFrom || null,
    p_available_to: input.availableTo || null,
    p_required_hours: input.requiredHours || null,
    p_note: input.note || null,
  });
  if (error) throw new Error(translate(error.message));
  return data as string;
}

const MAX_CV_BYTES = 5 * 1024 * 1024;

export async function uploadTrainingCv(applicationId: string, file: File): Promise<void> {
  if (file.size > MAX_CV_BYTES) throw new Error("حجم الملف يتجاوز 5 ميغابايت.");

  // Keep the extension and drop the rest of the name: it comes from the
  // applicant's machine and has no business becoming a storage path.
  const extension = (file.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const path = `${applicationId}/cv.${extension || "pdf"}`;

  const { error: uploadError } = await supabase.storage
    .from("training-cv")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (uploadError) throw new Error("تعذر رفع السيرة الذاتية. حاول مرة أخرى.");

  const { error } = await supabase.rpc("attach_training_cv", { p_id: applicationId, p_path: path });
  if (error) throw new Error(translate(error.message));
}

/* ------------------------------------------------------------ administration */

export type TrainingApplication = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  university: string;
  college: string | null;
  specialty: string;
  academicLevel: string | null;
  studentNumber: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  requiredHours: string | null;
  note: string | null;
  cvPath: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadTrainingApplications(): Promise<TrainingApplication[]> {
  const { data, error } = await supabase
    .from("training_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id, fullName: row.full_name, phone: row.phone, email: row.email,
    university: row.university, college: row.college, specialty: row.specialty,
    academicLevel: row.academic_level, studentNumber: row.student_number,
    availableFrom: row.available_from, availableTo: row.available_to,
    requiredHours: row.required_hours, note: row.note, cvPath: row.cv_path,
    status: row.status, reviewNote: row.review_note, createdAt: row.created_at,
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function setTrainingStatus(id: string, status: string, note: string) {
  const { error } = await supabase.rpc("review_training_application", {
    p_id: id, p_status: status, p_note: note || null,
  });
  if (error) throw new Error(translate(error.message));
}

/**
 * A short-lived link to a CV. The bucket is private, so the file is reached
 * through a signed URL rather than a public path.
 */
export async function cvDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("training-cv").createSignedUrl(path, 300);
  if (error || !data) throw new Error("تعذر فتح الملف.");
  return data.signedUrl;
}
