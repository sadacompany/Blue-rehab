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
  createdAt: string;
};

const APPLICATION_ERRORS: Record<string, string> = {
  NAME_INVALID: "الاسم المعروض يجب أن يكون بين ٣ و١٢٠ حرفًا.",
  TITLE_INVALID: "المسمى المهني يجب أن يكون بين ٣ و١٦٠ حرفًا.",
  ALREADY_PROVIDER: "حسابك يملك هذه الصفة بالفعل.",
  APPLICATION_NOT_FOUND: "لم نجد الطلب.",
  AUTH_REQUIRED: "يلزم تسجيل الدخول.",
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
};

export async function submitApplication(input: ApplicationInput): Promise<ProviderApplication> {
  const { data, error } = await supabase.rpc("submit_provider_application", {
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
  });
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
