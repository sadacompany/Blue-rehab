export type DeliveryMode = "clinic" | "remote";

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  modes: DeliveryMode[];
  isDemo: boolean;
};

export type Specialist = {
  id: string;
  name: string;
  title: string;
  bio: string;
  specialties: string[];
  languages: string[];
  isVerified: boolean;
  isDemo: boolean;
  /** Portrait, shown wherever the specialist is introduced. */
  photoUrl: string | null;
};

export type Course = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  durationHours: number;
  price: number;
  mode: "onsite" | "remote" | "recorded" | "hybrid";
  level: string;
  startsAt: string | null;
  learningOutcomes: string[];
  prerequisites: string[];
  language: string;
  certificateAvailable: boolean;
  isDemo: boolean;
  /** Poster artwork. The landing page shows only courses that have one. */
  coverUrl: string | null;
  /** Optional list price, struck through beside `price` when it is higher. */
  compareAtPrice: number | null;
  /**
   * Free-text credit for who presents the course. `trainer_id` needs a real
   * account with the trainer role, which the presenter may not have yet —
   * this is the interim, honest way to say whose course it is until then.
   */
  presenterName: string | null;
};

export type Branch = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  isDemo: boolean;
};

export type AvailabilitySlot = {
  id: string;
  specialistId: string;
  branchId: string | null;
  startsAt: string;
  endsAt: string;
  mode: DeliveryMode;
};

export type CatalogResponse = {
  services: Service[];
  specialists: Specialist[];
  courses: Course[];
  branches: Branch[];
  availability: AvailabilitySlot[];
  source: "supabase" | "preview";
};

export type CourseModule = {
  id: string;
  title: string;
  summary: string;
  position: number;
  lessons: Array<{
    id: string;
    title: string;
    contentType: string;
    durationMinutes: number | null;
    isPreview: boolean;
  }>;
};

export type CourseDetailResponse = {
  course: Course;
  modules: CourseModule[];
  source: "supabase" | "preview";
};
