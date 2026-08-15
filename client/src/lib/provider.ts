import { AuthenticationRequiredError } from "./platform";
import { supabase } from "./supabase";

/**
 * Applying to work on the platform as a specialist or a course instructor.
 *
 * Every write goes through a SECURITY DEFINER function. `profiles.roles` is not
 * updatable by `authenticated`, so an applicant cannot grant themselves the role
 * by editing their own request — only an administrator's approval can.
 */

export type ProviderKind = "specialist" | "trainer";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "withdrawn";

/** Objects live at <user-id>/<file>, which is what the storage policy checks. */
export async function uploadCredential(file: File): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  if (file.size > 10 * 1024 * 1024) throw new Error("حجم الملف يتجاوز ١٠ ميغابايت.");
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("يُقبل PDF أو صورة فقط.");

  // Storage keys must be ASCII — Supabase answers "Invalid key" to anything
  // else, so an Arabic filename cannot be carried through as-is. Stripping it
  // left «شهادة البكالوريوس.pdf» as «_-_.pdf», which tells a reviewer nothing,
  // so when nothing usable survives the extension becomes the name and the UI
  // numbers the attachments instead of showing a row of underscores.
  const dot = file.name.lastIndexOf(".");
  const extension = (dot > 0 ? file.name.slice(dot + 1) : "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase();
  const stem = (dot > 0 ? file.name.slice(0, dot) : file.name)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-60);
  const safe = `${stem || "credential"}${extension ? `.${extension}` : ""}`;
  const path = `${user.id}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("provider-credentials").upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * A short-lived link to a credential file, for the administrator reviewing it.
 *
 * The bucket is private, so there is no URL to link to directly. Approving an
 * application means looking at the evidence behind it, and until now the review
 * screen only said how many files there were.
 */
/**
 * The applicant's portrait.
 *
 * Same private bucket and the same owner-keyed folder as the credentials, so no
 * new storage policy is needed — but a fixed `portrait-` stem so the reviewer,
 * and the approval step that promotes it to the specialist photo, can pick it
 * out without guessing from the filename.
 */
export async function uploadApplicantPhoto(file: File): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  if (file.size > 5 * 1024 * 1024) throw new Error("حجم الصورة يتجاوز ٥ ميغابايت.");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("تُقبل صور JPG أو PNG أو WebP فقط.");

  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${user.id}/portrait-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from("provider-credentials")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

export async function credentialUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("provider-credentials").createSignedUrl(path, 300);
  if (error || !data) throw new Error("تعذر فتح الملف.");
  return data.signedUrl;
}

export async function removeCredential(path: string) {
  const { error } = await supabase.storage.from("provider-credentials").remove([path]);
  if (error) throw new Error(error.message);
}

export type ProviderApplication = {
  id: string;
  kind: ProviderKind;
  displayName: string;
  title: string;
  bio: string;
  specialties: string[];
  languages: string[];
  yearsExperience: number;
  licenseNumber: string | null;
  credentialsNote: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: ApplicationStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  credentialFiles: string[];
  photoPath: string | null;
  createdAt: string;
};

const APPLICATION_ERRORS: Record<string, string> = {
  NAME_INVALID: "الاسم المعروض يجب أن يكون بين ٣ و١٢٠ حرفًا.",
  TITLE_INVALID: "المسمى المهني يجب أن يكون بين ٣ و١٦٠ حرفًا.",
  ALREADY_PROVIDER: "حسابك يملك هذه الصفة بالفعل.",
  APPLICATION_NOT_FOUND: "لم نجد الطلب.",
  AUTH_REQUIRED: "يلزم تسجيل الدخول.",
  PHOTO_REQUIRED: "أرفق صورة شخصية واضحة.",
  CREDENTIAL_PATH_INVALID: "تعذر التحقق من الملفات المرفقة. أعد رفعها ثم حاول مرة أخرى.",
};

function translate(message: string): string {
  const code = Object.keys(APPLICATION_ERRORS).find((key) => message.includes(key));
  return code ? APPLICATION_ERRORS[code] : message;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toApplication(row: any): ProviderApplication {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    title: row.title,
    bio: row.bio ?? "",
    specialties: row.specialties ?? [],
    languages: row.languages ?? [],
    yearsExperience: row.years_experience ?? 0,
    licenseNumber: row.license_number,
    credentialsNote: row.credentials_note,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    credentialFiles: row.credential_files ?? [],
    photoPath: row.photo_path ?? null,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Applications filed by the signed-in user, newest first. */
export async function loadMyApplications(): Promise<ProviderApplication[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new AuthenticationRequiredError();

  const { data, error } = await supabase
    .from("provider_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toApplication);
}

export type ApplicationInput = {
  kind: ProviderKind;
  displayName: string;
  title: string;
  bio: string;
  specialties: string[];
  languages: string[];
  yearsExperience: number;
  licenseNumber: string;
  credentialsNote: string;
  contactEmail: string;
  contactPhone: string;
  credentialFiles: string[];
  photoPath: string | null;
};

export async function submitApplication(input: ApplicationInput): Promise<ProviderApplication> {
  const base = {
    p_kind: input.kind,
    p_display_name: input.displayName,
    p_title: input.title,
    p_bio: input.bio || null,
    p_specialties: input.specialties,
    p_languages: input.languages.length ? input.languages : ["العربية"],
    p_years_experience: input.yearsExperience,
    p_license_number: input.licenseNumber || null,
    p_credentials_note: input.credentialsNote || null,
    p_contact_email: input.contactEmail || null,
    p_contact_phone: input.contactPhone || null,
    p_credential_files: input.credentialFiles ?? [],
  };

  const { data, error } = await supabase.rpc("submit_provider_application", {
    ...base,
    p_photo_path: input.photoPath,
  });

  /**
   * The portrait parameter arrives with 20260815120000_provider_application_portrait.
   * Until that migration is applied, PostgREST cannot find a function with this
   * signature and answers PGRST202. Rather than fail the whole submission, the
   * request is retried against the older shape with the portrait filed among the
   * credential attachments — it is an image in a private bucket either way, so
   * the reviewer still sees it and nothing the applicant uploaded is lost.
   *
   * Remove this fallback once the migration is applied everywhere.
   */
  if (error?.code === "PGRST202" && input.photoPath) {
    const retry = await supabase.rpc("submit_provider_application", {
      ...base,
      p_credential_files: [input.photoPath, ...(input.credentialFiles ?? [])],
    });
    if (retry.error) throw new Error(translate(retry.error.message));
    return toApplication(retry.data);
  }

  if (error) throw new Error(translate(error.message));
  return toApplication(data);
}

export async function withdrawApplication(applicationId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_provider_application", { p_application_id: applicationId });
  if (error) throw new Error(translate(error.message));
}

/** Roles on the signed-in account, used to decide which dashboards to offer. */
export async function loadMyRoles(): Promise<string[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AuthenticationRequiredError();

  const { data, error } = await supabase.from("profiles").select("roles").eq("id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.roles ?? [];
}
