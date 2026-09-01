export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      articles: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string | null
          category: string | null
          cover_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          reading_minutes: number | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body?: string | null
          category?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          reading_minutes?: number | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string | null
          category?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          reading_minutes?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          checked_in_at: string | null
          created_at: string
          enrollment_id: string
          id: string
          note: string | null
          session_title: string
          starts_at: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          note?: string | null
          session_title: string
          starts_at: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          note?: string | null
          session_title?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          branch_id: string | null
          created_at: string
          ends_at: string
          id: string
          is_available: boolean
          mode: Database["public"]["Enums"]["delivery_mode"]
          specialist_id: string
          starts_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          is_available?: boolean
          mode: Database["public"]["Enums"]["delivery_mode"]
          specialist_id: string
          starts_at: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          is_available?: boolean
          mode?: Database["public"]["Enums"]["delivery_mode"]
          specialist_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          branch_id: string | null
          created_at: string
          ends_at: string | null
          id: string
          meeting_event_id: string | null
          meeting_provider: string | null
          meeting_url: string | null
          mode: Database["public"]["Enums"]["delivery_mode"]
          notes: string | null
          patient_id: string
          service_id: string
          slot_id: string | null
          specialist_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          meeting_event_id?: string | null
          meeting_provider?: string | null
          meeting_url?: string | null
          mode: Database["public"]["Enums"]["delivery_mode"]
          notes?: string | null
          patient_id: string
          service_id: string
          slot_id?: string | null
          specialist_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          meeting_event_id?: string | null
          meeting_provider?: string | null
          meeting_url?: string | null
          mode?: Database["public"]["Enums"]["delivery_mode"]
          notes?: string | null
          patient_id?: string
          service_id?: string
          slot_id?: string | null
          specialist_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          city: string
          id: string
          is_active: boolean
          is_demo: boolean
          latitude: number | null
          longitude: number | null
          name: string
        }
        Insert: {
          address?: string | null
          city: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
        }
        Update: {
          address?: string | null
          city?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          certificate_number: string
          enrollment_id: string
          file_path: string | null
          id: string
          issued_at: string
          revoked_at: string | null
        }
        Insert: {
          certificate_number: string
          enrollment_id: string
          file_path?: string | null
          id?: string
          issued_at?: string
          revoked_at?: string | null
        }
        Update: {
          certificate_number?: string
          enrollment_id?: string
          file_path?: string | null
          id?: string
          issued_at?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          booking_id: string | null
          consent_text: string
          created_at: string
          granted_at: string
          id: string
          ip_address: unknown
          purpose: string
          template_version: string
          user_agent: string | null
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          booking_id?: string | null
          consent_text: string
          created_at?: string
          granted_at?: string
          id?: string
          ip_address?: unknown
          purpose?: string
          template_version: string
          user_agent?: string | null
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          booking_id?: string | null
          consent_text?: string
          created_at?: string
          granted_at?: string
          id?: string
          ip_address?: unknown
          purpose?: string
          template_version?: string
          user_agent?: string | null
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          available_at: string | null
          content_type: string
          content_url: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          is_preview: boolean
          module_id: string
          position: number
          requires_previous: boolean
          title: string
        }
        Insert: {
          available_at?: string | null
          content_type: string
          content_url?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          is_preview?: boolean
          module_id: string
          position: number
          requires_previous?: boolean
          title: string
        }
        Update: {
          available_at?: string | null
          content_type?: string
          content_url?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          is_preview?: boolean
          module_id?: string
          position?: number
          requires_previous?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          available_at: string | null
          course_id: string
          created_at: string
          id: string
          position: number
          summary: string | null
          title: string
        }
        Insert: {
          available_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          position: number
          summary?: string | null
          title: string
        }
        Update: {
          available_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          position?: number
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_price_tiers: {
        Row: {
          course_id: string
          created_at: string
          id: string
          key: string
          label: string
          position: number
          price: number
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          key: string
          label: string
          position?: number
          price: number
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          position?: number
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_price_tiers_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_registrations: {
        Row: {
          attended_similar: boolean
          course_id: string
          created_at: string
          discount_amount: number
          email: string
          enrollment_id: string | null
          full_name: string
          goal_other: string | null
          goals: string[]
          gross_amount: number
          id: string
          is_member: boolean
          job_title: string | null
          knowledge_level: number
          membership_number: string | null
          membership_verified_at: string | null
          membership_verified_by: string | null
          net_amount: number
          organization: string | null
          payment_id: string | null
          phone: string
          question: string | null
          status: string
          tier_key: string
          topics: string[]
          updated_at: string
          user_id: string
          years_experience: string | null
        }
        Insert: {
          attended_similar: boolean
          course_id: string
          created_at?: string
          discount_amount?: number
          email: string
          enrollment_id?: string | null
          full_name: string
          goal_other?: string | null
          goals?: string[]
          gross_amount: number
          id?: string
          is_member?: boolean
          job_title?: string | null
          knowledge_level: number
          membership_number?: string | null
          membership_verified_at?: string | null
          membership_verified_by?: string | null
          net_amount: number
          organization?: string | null
          payment_id?: string | null
          phone: string
          question?: string | null
          status?: string
          tier_key: string
          topics?: string[]
          updated_at?: string
          user_id: string
          years_experience?: string | null
        }
        Update: {
          attended_similar?: boolean
          course_id?: string
          created_at?: string
          discount_amount?: number
          email?: string
          enrollment_id?: string | null
          full_name?: string
          goal_other?: string | null
          goals?: string[]
          gross_amount?: number
          id?: string
          is_member?: boolean
          job_title?: string | null
          knowledge_level?: number
          membership_number?: string | null
          membership_verified_at?: string | null
          membership_verified_by?: string | null
          net_amount?: number
          organization?: string | null
          payment_id?: string | null
          phone?: string
          question?: string | null
          status?: string
          tier_key?: string
          topics?: string[]
          updated_at?: string
          user_id?: string
          years_experience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_registrations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_membership_verified_by_fkey"
            columns: ["membership_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          capacity: number | null
          certificate_available: boolean
          compare_at_price: number | null
          cover_url: string | null
          created_at: string
          description: string | null
          duration_hours: number
          ends_at: string | null
          id: string
          is_demo: boolean
          is_published: boolean
          language: string
          learning_outcomes: string[]
          level: string
          membership_discount_percent: number | null
          mode: Database["public"]["Enums"]["course_mode"]
          prerequisites: string[]
          presenter_name: string | null
          price: number
          review_note: string | null
          review_status: Database["public"]["Enums"]["content_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          starts_at: string | null
          submitted_at: string | null
          summary: string | null
          title: string
          trainer_id: string | null
          venue: string | null
        }
        Insert: {
          capacity?: number | null
          certificate_available?: boolean
          compare_at_price?: number | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          duration_hours?: number
          ends_at?: string | null
          id?: string
          is_demo?: boolean
          is_published?: boolean
          language?: string
          learning_outcomes?: string[]
          level?: string
          membership_discount_percent?: number | null
          mode?: Database["public"]["Enums"]["course_mode"]
          prerequisites?: string[]
          presenter_name?: string | null
          price?: number
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["content_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          starts_at?: string | null
          submitted_at?: string | null
          summary?: string | null
          title: string
          trainer_id?: string | null
          venue?: string | null
        }
        Update: {
          capacity?: number | null
          certificate_available?: boolean
          compare_at_price?: number | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          duration_hours?: number
          ends_at?: string | null
          id?: string
          is_demo?: boolean
          is_published?: boolean
          language?: string
          learning_outcomes?: string[]
          level?: string
          membership_discount_percent?: number | null
          mode?: Database["public"]["Enums"]["course_mode"]
          prerequisites?: string[]
          presenter_name?: string | null
          price?: number
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["content_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          starts_at?: string | null
          submitted_at?: string | null
          summary?: string | null
          title?: string
          trainer_id?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          amount_due: number
          completed_at: string | null
          course_id: string
          created_at: string
          id: string
          progress: number
          status: string
          student_id: string
        }
        Insert: {
          amount_due?: number
          completed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          progress?: number
          status?: string
          student_id: string
        }
        Update: {
          amount_due?: number
          completed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          progress?: number
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          exercise_id: string
          id: string
          media_path: string | null
          note: string | null
          pain_after: number | null
          pain_before: number | null
          patient_id: string
          scheduled_for: string
          status: Database["public"]["Enums"]["exercise_log_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          exercise_id: string
          id?: string
          media_path?: string | null
          note?: string | null
          pain_after?: number | null
          pain_before?: number | null
          patient_id: string
          scheduled_for: string
          status?: Database["public"]["Enums"]["exercise_log_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          exercise_id?: string
          id?: string
          media_path?: string | null
          note?: string | null
          pain_after?: number | null
          pain_before?: number | null
          patient_id?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["exercise_log_status"]
        }
        Relationships: [
          {
            foreignKeyName: "exercise_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string
          description: string | null
          id: string
          media_url: string | null
          name: string
          position: number
          repetitions: string | null
          safety_instructions: string | null
          schedule_text: string | null
          treatment_plan_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          media_url?: string | null
          name: string
          position?: number
          repetitions?: string | null
          safety_instructions?: string | null
          schedule_text?: string | null
          treatment_plan_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          media_url?: string | null
          name?: string
          position?: number
          repetitions?: string | null
          safety_instructions?: string | null
          schedule_text?: string | null
          treatment_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          id: string
          lesson_id: string
          progress: number
          student_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          lesson_id: string
          progress?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          lesson_id?: string
          progress?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_files: {
        Row: {
          booking_id: string | null
          category: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          owner_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          booking_id?: string | null
          category?: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          owner_id: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          booking_id?: string | null
          category?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          owner_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_files_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_files_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          data: Json
          event_type: string
          failed_at: string | null
          id: string
          read_at: string | null
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          data?: Json
          event_type: string
          failed_at?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          data?: Json
          event_type?: string
          failed_at?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_health_profiles: {
        Row: {
          affected_region: string | null
          birth_date: string | null
          chronic_conditions: string | null
          city: string | null
          complaint: string | null
          consent_privacy: boolean
          consent_share_with_specialist: boolean
          current_medications: string | null
          emergency_contact: Json | null
          gender: string | null
          pain_level: number | null
          previous_injuries: string | null
          previous_surgeries: string | null
          symptoms_started_on: string | null
          treatment_goal: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          affected_region?: string | null
          birth_date?: string | null
          chronic_conditions?: string | null
          city?: string | null
          complaint?: string | null
          consent_privacy?: boolean
          consent_share_with_specialist?: boolean
          current_medications?: string | null
          emergency_contact?: Json | null
          gender?: string | null
          pain_level?: number | null
          previous_injuries?: string | null
          previous_surgeries?: string | null
          symptoms_started_on?: string | null
          treatment_goal?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          affected_region?: string | null
          birth_date?: string | null
          chronic_conditions?: string | null
          city?: string | null
          complaint?: string | null
          consent_privacy?: boolean
          consent_share_with_specialist?: boolean
          current_medications?: string | null
          emergency_contact?: Json | null
          gender?: string | null
          pain_level?: number | null
          previous_injuries?: string | null
          previous_surgeries?: string | null
          symptoms_started_on?: string | null
          treatment_goal?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_health_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          currency: string
          discount: number
          enrollment_id: string | null
          failure_reason: string | null
          fees: number
          gateway_reference: string | null
          id: string
          intent_course_id: string | null
          intent_kind: string | null
          intent_mode: Database["public"]["Enums"]["delivery_mode"] | null
          intent_notes: string | null
          intent_service_id: string | null
          intent_slot_id: string | null
          intent_specialist_id: string | null
          order_number: string
          paid_at: string | null
          payment_url: string | null
          promo_code_id: string | null
          provider: string
          provider_invoice_id: string | null
          provider_payment_id: string | null
          refunded_amount: number
          reserved_until: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tax: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          discount?: number
          enrollment_id?: string | null
          failure_reason?: string | null
          fees?: number
          gateway_reference?: string | null
          id?: string
          intent_course_id?: string | null
          intent_kind?: string | null
          intent_mode?: Database["public"]["Enums"]["delivery_mode"] | null
          intent_notes?: string | null
          intent_service_id?: string | null
          intent_slot_id?: string | null
          intent_specialist_id?: string | null
          order_number: string
          paid_at?: string | null
          payment_url?: string | null
          promo_code_id?: string | null
          provider?: string
          provider_invoice_id?: string | null
          provider_payment_id?: string | null
          refunded_amount?: number
          reserved_until?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tax?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          discount?: number
          enrollment_id?: string | null
          failure_reason?: string | null
          fees?: number
          gateway_reference?: string | null
          id?: string
          intent_course_id?: string | null
          intent_kind?: string | null
          intent_mode?: Database["public"]["Enums"]["delivery_mode"] | null
          intent_notes?: string | null
          intent_service_id?: string | null
          intent_slot_id?: string | null
          intent_specialist_id?: string | null
          order_number?: string
          paid_at?: string | null
          payment_url?: string | null
          promo_code_id?: string | null
          provider?: string
          provider_invoice_id?: string | null
          provider_payment_id?: string | null
          refunded_amount?: number
          reserved_until?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tax?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_intent_course_id_fkey"
            columns: ["intent_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_intent_service_id_fkey"
            columns: ["intent_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_intent_slot_id_fkey"
            columns: ["intent_slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_intent_specialist_id_fkey"
            columns: ["intent_specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          roles: Database["public"]["Enums"]["user_role"][]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          roles?: Database["public"]["Enums"]["user_role"][]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          roles?: Database["public"]["Enums"]["user_role"][]
          updated_at?: string
        }
        Relationships: []
      }
      promo_code_redemptions: {
        Row: {
          discount_amount: number
          gross_amount: number
          id: string
          kind: string
          net_amount: number
          order_number: string | null
          payment_id: string | null
          promo_code_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          discount_amount: number
          gross_amount: number
          id?: string
          kind: string
          net_amount: number
          order_number?: string | null
          payment_id?: string | null
          promo_code_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          discount_amount?: number
          gross_amount?: number
          id?: string
          kind?: string
          net_amount?: number
          order_number?: string | null
          payment_id?: string | null
          promo_code_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_redemptions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_visits: {
        Row: {
          first_seen_at: string
          id: string
          promo_code_id: string
          visitor_key: string
        }
        Insert: {
          first_seen_at?: string
          id?: string
          promo_code_id: string
          visitor_key: string
        }
        Update: {
          first_seen_at?: string
          id?: string
          promo_code_id?: string
          visitor_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_visits_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          discount_percent: number
          ends_at: string | null
          id: string
          internal_note: string | null
          is_paused: boolean
          kind: string
          marketer_name: string | null
          starts_at: string | null
          updated_at: string
          usage_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          ends_at?: string | null
          id?: string
          internal_note?: string | null
          is_paused?: boolean
          kind: string
          marketer_name?: string | null
          starts_at?: string | null
          updated_at?: string
          usage_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          ends_at?: string | null
          id?: string
          internal_note?: string | null
          is_paused?: boolean
          kind?: string
          marketer_name?: string | null
          starts_at?: string | null
          updated_at?: string
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_applications: {
        Row: {
          bio: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          credential_files: string[]
          credentials_note: string | null
          display_name: string
          id: string
          kind: Database["public"]["Enums"]["provider_kind"]
          languages: string[]
          license_number: string | null
          photo_path: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specialties: string[]
          status: Database["public"]["Enums"]["application_status"]
          title: string
          updated_at: string
          user_id: string
          years_experience: number
        }
        Insert: {
          bio?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          credential_files?: string[]
          credentials_note?: string | null
          display_name: string
          id?: string
          kind: Database["public"]["Enums"]["provider_kind"]
          languages?: string[]
          license_number?: string | null
          photo_path?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialties?: string[]
          status?: Database["public"]["Enums"]["application_status"]
          title: string
          updated_at?: string
          user_id: string
          years_experience?: number
        }
        Update: {
          bio?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          credential_files?: string[]
          credentials_note?: string | null
          display_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["provider_kind"]
          languages?: string[]
          license_number?: string | null
          photo_path?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialties?: string[]
          status?: Database["public"]["Enums"]["application_status"]
          title?: string
          updated_at?: string
          user_id?: string
          years_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "provider_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rehab_programs: {
        Row: {
          compare_at_price: number | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_weeks: number | null
          goals: string[]
          id: string
          level: string
          position: number
          price: number
          published_at: string | null
          sessions_per_week: number | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          suitable_for: string[]
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          compare_at_price?: number | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_weeks?: number | null
          goals?: string[]
          id?: string
          level?: string
          position?: number
          price?: number
          published_at?: string | null
          sessions_per_week?: number | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          suitable_for?: string[]
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          compare_at_price?: number | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_weeks?: number | null
          goals?: string[]
          id?: string
          level?: string
          position?: number
          price?: number
          published_at?: string | null
          sessions_per_week?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          suitable_for?: string[]
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rehab_programs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      research_reviews: {
        Row: {
          body: string | null
          cover_url: string | null
          created_at: string
          evidence_level: string | null
          excerpt: string | null
          id: string
          key_findings: string[]
          practical_takeaway: string | null
          published_at: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          slug: string
          source_authors: string | null
          source_journal: string | null
          source_title: string | null
          source_url: string | null
          source_year: number | null
          status: Database["public"]["Enums"]["content_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          cover_url?: string | null
          created_at?: string
          evidence_level?: string | null
          excerpt?: string | null
          id?: string
          key_findings?: string[]
          practical_takeaway?: string | null
          published_at?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          slug: string
          source_authors?: string | null
          source_journal?: string | null
          source_title?: string | null
          source_url?: string | null
          source_year?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          cover_url?: string | null
          created_at?: string
          evidence_level?: string | null
          excerpt?: string | null
          id?: string
          key_findings?: string[]
          practical_takeaway?: string | null
          published_at?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          slug?: string
          source_authors?: string | null
          source_journal?: string | null
          source_title?: string | null
          source_url?: string | null
          source_year?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string | null
          comment: string | null
          course_id: string | null
          created_at: string
          dimensions: Json
          enrollment_id: string | null
          id: string
          published_at: string | null
          rating: number
          response: string | null
          specialist_id: string | null
          status: Database["public"]["Enums"]["review_status"]
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          comment?: string | null
          course_id?: string | null
          created_at?: string
          dimensions?: Json
          enrollment_id?: string | null
          id?: string
          published_at?: string | null
          rating: number
          response?: string | null
          specialist_id?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          user_id: string
        }
        Update: {
          booking_id?: string | null
          comment?: string | null
          course_id?: string | null
          created_at?: string
          dimensions?: Json
          enrollment_id?: string | null
          id?: string
          published_at?: string | null
          rating?: number
          response?: string | null
          specialist_id?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          allowed_modes: Database["public"]["Enums"]["delivery_mode"][]
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          is_coming_soon: boolean
          is_demo: boolean
          name: string
          price: number
        }
        Insert: {
          allowed_modes?: Database["public"]["Enums"]["delivery_mode"][]
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          is_coming_soon?: boolean
          is_demo?: boolean
          name: string
          price: number
        }
        Update: {
          allowed_modes?: Database["public"]["Enums"]["delivery_mode"][]
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_coming_soon?: boolean
          is_demo?: boolean
          name?: string
          price?: number
        }
        Relationships: []
      }
      session_notes: {
        Row: {
          assessment: string | null
          booking_id: string
          completed_at: string | null
          created_at: string
          id: string
          interventions: string | null
          recommendations: string | null
          response: string | null
          specialist_id: string
          updated_at: string
        }
        Insert: {
          assessment?: string | null
          booking_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          interventions?: string | null
          recommendations?: string | null
          response?: string | null
          specialist_id: string
          updated_at?: string
        }
        Update: {
          assessment?: string | null
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          interventions?: string | null
          recommendations?: string | null
          response?: string | null
          specialist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      specialist_services: {
        Row: {
          created_at: string
          service_id: string
          specialist_id: string
        }
        Insert: {
          created_at?: string
          service_id: string
          specialist_id: string
        }
        Update: {
          created_at?: string
          service_id?: string
          specialist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialist_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specialist_services_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      specialists: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          is_demo: boolean
          is_verified: boolean
          languages: string[]
          photo_url: string | null
          profile_id: string | null
          rating: number
          review_count: number
          specialties: string[]
          team_order: number | null
          title: string
          years_experience: number
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          is_verified?: boolean
          languages?: string[]
          photo_url?: string | null
          profile_id?: string | null
          rating?: number
          review_count?: number
          specialties?: string[]
          team_order?: number | null
          title: string
          years_experience?: number
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          is_verified?: boolean
          languages?: string[]
          photo_url?: string | null
          profile_id?: string | null
          rating?: number
          review_count?: number
          specialties?: string[]
          team_order?: number | null
          title?: string
          years_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "specialists_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string
          name: string
          phone: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message: string
          name: string
          phone?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          name?: string
          phone?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_applications: {
        Row: {
          academic_level: string | null
          available_from: string | null
          available_to: string | null
          college: string | null
          created_at: string
          cv_path: string | null
          email: string | null
          full_name: string
          id: string
          note: string | null
          phone: string
          required_hours: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specialty: string
          status: string
          student_number: string | null
          university: string
        }
        Insert: {
          academic_level?: string | null
          available_from?: string | null
          available_to?: string | null
          college?: string | null
          created_at?: string
          cv_path?: string | null
          email?: string | null
          full_name: string
          id?: string
          note?: string | null
          phone: string
          required_hours?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialty: string
          status?: string
          student_number?: string | null
          university: string
        }
        Update: {
          academic_level?: string | null
          available_from?: string | null
          available_to?: string | null
          college?: string | null
          created_at?: string
          cv_path?: string | null
          email?: string | null
          full_name?: string
          id?: string
          note?: string | null
          phone?: string
          required_hours?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialty?: string
          status?: string
          student_number?: string | null
          university?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          created_at: string
          diagnosis_summary: string | null
          duration_weeks: number | null
          goals: string[]
          id: string
          is_published: boolean
          patient_id: string
          precautions: string | null
          progress_indicators: string[]
          proposed_sessions: number | null
          review_at: string | null
          safety_instructions: string | null
          specialist_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          diagnosis_summary?: string | null
          duration_weeks?: number | null
          goals?: string[]
          id?: string
          is_published?: boolean
          patient_id: string
          precautions?: string | null
          progress_indicators?: string[]
          proposed_sessions?: number | null
          review_at?: string | null
          safety_instructions?: string | null
          specialist_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          diagnosis_summary?: string | null
          duration_weeks?: number | null
          goals?: string[]
          id?: string
          is_published?: boolean
          patient_id?: string
          precautions?: string | null
          progress_indicators?: string[]
          proposed_sessions?: number | null
          review_at?: string | null
          safety_instructions?: string | null
          specialist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_course: {
        Args: {
          p_duration_hours?: number
          p_language?: string
          p_level: string
          p_mode: string
          p_price?: number
          p_summary?: string
          p_title: string
          p_trainer_id?: string
        }
        Returns: {
          capacity: number | null
          certificate_available: boolean
          compare_at_price: number | null
          cover_url: string | null
          created_at: string
          description: string | null
          duration_hours: number
          ends_at: string | null
          id: string
          is_demo: boolean
          is_published: boolean
          language: string
          learning_outcomes: string[]
          level: string
          membership_discount_percent: number | null
          mode: Database["public"]["Enums"]["course_mode"]
          prerequisites: string[]
          presenter_name: string | null
          price: number
          review_note: string | null
          review_status: Database["public"]["Enums"]["content_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          starts_at: string | null
          submitted_at: string | null
          summary: string | null
          title: string
          trainer_id: string | null
          venue: string | null
        }
        SetofOptions: {
          from: "*"
          to: "courses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_promo_code: {
        Args: {
          p_code: string
          p_discount_percent?: number
          p_ends_at?: string
          p_internal_note?: string
          p_kind: string
          p_marketer_name?: string
          p_starts_at?: string
          p_usage_limit?: number
        }
        Returns: {
          code: string
          created_at: string
          created_by: string | null
          discount_percent: number
          ends_at: string | null
          id: string
          internal_note: string | null
          is_paused: boolean
          kind: string
          marketer_name: string | null
          starts_at: string | null
          updated_at: string
          usage_limit: number | null
        }
        SetofOptions: {
          from: "*"
          to: "promo_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_delete_content: {
        Args: { p_id: string; p_table: string }
        Returns: Json
      }
      admin_overview: { Args: never; Returns: Json }
      admin_promo_code_redemptions: {
        Args: { p_id: string; p_limit?: number }
        Returns: {
          discount_amount: number
          gross_amount: number
          id: string
          kind: string
          net_amount: number
          order_number: string
          redeemed_at: string
          user_name: string
        }[]
      }
      admin_promo_codes: {
        Args: never
        Returns: {
          code: string
          created_at: string
          discount_percent: number
          discount_total: number
          ends_at: string
          gross_total: number
          id: string
          internal_note: string
          is_paused: boolean
          kind: string
          last_used_at: string
          marketer_name: string
          net_total: number
          starts_at: string
          status: string
          usage_limit: number
          uses: number
          visits: number
        }[]
      }
      admin_set_course_offer: {
        Args: { p_course_id: string; p_enabled: boolean }
        Returns: {
          capacity: number | null
          certificate_available: boolean
          compare_at_price: number | null
          cover_url: string | null
          created_at: string
          description: string | null
          duration_hours: number
          ends_at: string | null
          id: string
          is_demo: boolean
          is_published: boolean
          language: string
          learning_outcomes: string[]
          level: string
          membership_discount_percent: number | null
          mode: Database["public"]["Enums"]["course_mode"]
          prerequisites: string[]
          presenter_name: string | null
          price: number
          review_note: string | null
          review_status: Database["public"]["Enums"]["content_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          starts_at: string | null
          submitted_at: string | null
          summary: string | null
          title: string
          trainer_id: string | null
          venue: string | null
        }
        SetofOptions: {
          from: "*"
          to: "courses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_course_price_tiers: {
        Args: { p_course_id: string; p_tiers: Json }
        Returns: {
          course_id: string
          created_at: string
          id: string
          key: string
          label: string
          position: number
          price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "course_price_tiers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_set_specialist_verified: {
        Args: { p_specialist_id: string; p_verified: boolean }
        Returns: undefined
      }
      admin_set_support_status: {
        Args: { p_request_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_user_roles: {
        Args: {
          p_roles: Database["public"]["Enums"]["user_role"][]
          p_user_id: string
        }
        Returns: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          roles: Database["public"]["Enums"]["user_role"][]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_course: {
        Args: { p_course_id: string; p_patch: Json }
        Returns: {
          capacity: number | null
          certificate_available: boolean
          compare_at_price: number | null
          cover_url: string | null
          created_at: string
          description: string | null
          duration_hours: number
          ends_at: string | null
          id: string
          is_demo: boolean
          is_published: boolean
          language: string
          learning_outcomes: string[]
          level: string
          membership_discount_percent: number | null
          mode: Database["public"]["Enums"]["course_mode"]
          prerequisites: string[]
          presenter_name: string | null
          price: number
          review_note: string | null
          review_status: Database["public"]["Enums"]["content_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          starts_at: string | null
          submitted_at: string | null
          summary: string | null
          title: string
          trainer_id: string | null
          venue: string | null
        }
        SetofOptions: {
          from: "*"
          to: "courses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_promo_code: {
        Args: {
          p_clear?: string[]
          p_discount_percent?: number
          p_ends_at?: string
          p_id: string
          p_internal_note?: string
          p_is_paused?: boolean
          p_marketer_name?: string
          p_starts_at?: string
          p_usage_limit?: number
        }
        Returns: {
          code: string
          created_at: string
          created_by: string | null
          discount_percent: number
          ends_at: string | null
          id: string
          internal_note: string | null
          is_paused: boolean
          kind: string
          marketer_name: string | null
          starts_at: string | null
          updated_at: string
          usage_limit: number | null
        }
        SetofOptions: {
          from: "*"
          to: "promo_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_verify_membership: {
        Args: { p_registration_id: string; p_verified: boolean }
        Returns: {
          attended_similar: boolean
          course_id: string
          created_at: string
          discount_amount: number
          email: string
          enrollment_id: string | null
          full_name: string
          goal_other: string | null
          goals: string[]
          gross_amount: number
          id: string
          is_member: boolean
          job_title: string | null
          knowledge_level: number
          membership_number: string | null
          membership_verified_at: string | null
          membership_verified_by: string | null
          net_amount: number
          organization: string | null
          payment_id: string | null
          phone: string
          question: string | null
          status: string
          tier_key: string
          topics: string[]
          updated_at: string
          user_id: string
          years_experience: string | null
        }
        SetofOptions: {
          from: "*"
          to: "course_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      after_intent_settled: {
        Args: {
          p_kind: string
          p_pay: Database["public"]["Tables"]["payments"]["Row"]
        }
        Returns: undefined
      }
      attach_training_cv: {
        Args: { p_id: string; p_path: string }
        Returns: undefined
      }
      content_slug: { Args: { p_title: string }; Returns: string }
      convert_paid_intent: { Args: { p_order_number: string }; Returns: string }
      course_registration_roster: {
        Args: { p_course_id: string }
        Returns: {
          attended_similar: boolean
          created_at: string
          discount_amount: number
          email: string
          full_name: string
          goal_other: string
          goals: string[]
          gross_amount: number
          id: string
          is_member: boolean
          job_title: string
          knowledge_level: number
          membership_number: string
          membership_verified_at: string
          net_amount: number
          organization: string
          phone: string
          question: string
          status: string
          tier_key: string
          topics: string[]
          years_experience: string
        }[]
      }
      create_booking_intent: {
        Args: {
          p_notes?: string
          p_promo_code?: string
          p_service_id: string
          p_slot_id: string
          p_specialist_id: string
        }
        Returns: {
          amount: number
          currency: string
          discount: number
          ends_at: string
          mode: Database["public"]["Enums"]["delivery_mode"]
          order_number: string
          reserved_until: string
          starts_at: string
        }[]
      }
      create_enrollment_intent: {
        Args: { p_course_id: string; p_promo_code?: string }
        Returns: {
          amount: number
          course_title: string
          currency: string
          discount: number
          order_number: string
        }[]
      }
      create_onsite_registration_intent: {
        Args: {
          p_attended_similar: boolean
          p_course_id: string
          p_email: string
          p_full_name: string
          p_goal_other?: string
          p_goals: string[]
          p_is_member?: boolean
          p_job_title?: string
          p_knowledge_level: number
          p_membership_number?: string
          p_organization?: string
          p_phone: string
          p_promo_code?: string
          p_question?: string
          p_tier_key: string
          p_topics: string[]
          p_years_experience?: string
        }
        Returns: {
          course_title: string
          currency: string
          discount_amount: number
          gross_amount: number
          net_amount: number
          order_number: string
          registration_id: string
        }[]
      }
      gateway_minimum_charge: { Args: never; Returns: number }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      onsite_registration_quote: {
        Args: {
          p_course_id: string
          p_is_member?: boolean
          p_promo_code?: string
          p_tier_key?: string
        }
        Returns: {
          discount_amount: number
          discount_label: string
          gross_amount: number
          net_amount: number
          promo_code_id: string
        }[]
      }
      promo_apply: {
        Args: {
          p_code: string
          p_gross: number
          p_kind: string
          p_user: string
        }
        Returns: {
          discount_amount: number
          net_amount: number
          promo_code_id: string
        }[]
      }
      promo_code_state: {
        Args: {
          p_ends_at: string
          p_is_paused: boolean
          p_starts_at: string
          p_usage_limit: number
          p_uses: number
        }
        Returns: string
      }
      publish_content: {
        Args: {
          p_id: string
          p_status: Database["public"]["Enums"]["content_status"]
          p_table: string
        }
        Returns: undefined
      }
      record_promo_visit: {
        Args: { p_code: string; p_visitor_key: string }
        Returns: undefined
      }
      release_expired_reservations: { Args: never; Returns: number }
      release_intent: { Args: { p_order_number: string }; Returns: undefined }
      reservation_window: { Args: never; Returns: string }
      review_course: {
        Args: { p_approve: boolean; p_course_id: string; p_note?: string }
        Returns: {
          capacity: number | null
          certificate_available: boolean
          compare_at_price: number | null
          cover_url: string | null
          created_at: string
          description: string | null
          duration_hours: number
          ends_at: string | null
          id: string
          is_demo: boolean
          is_published: boolean
          language: string
          learning_outcomes: string[]
          level: string
          membership_discount_percent: number | null
          mode: Database["public"]["Enums"]["course_mode"]
          prerequisites: string[]
          presenter_name: string | null
          price: number
          review_note: string | null
          review_status: Database["public"]["Enums"]["content_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          starts_at: string | null
          submitted_at: string | null
          summary: string | null
          title: string
          trainer_id: string | null
          venue: string | null
        }
        SetofOptions: {
          from: "*"
          to: "courses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_provider_application: {
        Args: { p_application_id: string; p_approve: boolean; p_note?: string }
        Returns: {
          bio: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          credential_files: string[]
          credentials_note: string | null
          display_name: string
          id: string
          kind: Database["public"]["Enums"]["provider_kind"]
          languages: string[]
          license_number: string | null
          photo_path: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specialties: string[]
          status: Database["public"]["Enums"]["application_status"]
          title: string
          updated_at: string
          user_id: string
          years_experience: number
        }
        SetofOptions: {
          from: "*"
          to: "provider_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_training_application: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: undefined
      }
      set_team_position: {
        Args: { p_position: number; p_specialist_id: string }
        Returns: undefined
      }
      specialist_set_booking_status: {
        Args: {
          p_booking_id: string
          p_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      submit_content_for_review: {
        Args: {
          p_body?: string
          p_category?: string
          p_cover_url?: string
          p_excerpt?: string
          p_kind: string
          p_practical_takeaway?: string
          p_source_authors?: string
          p_source_journal?: string
          p_source_title?: string
          p_source_url?: string
          p_source_year?: number
          p_tags?: string[]
          p_title: string
        }
        Returns: Json
      }
      submit_course_for_review: {
        Args: { p_course_id: string }
        Returns: {
          capacity: number | null
          certificate_available: boolean
          compare_at_price: number | null
          cover_url: string | null
          created_at: string
          description: string | null
          duration_hours: number
          ends_at: string | null
          id: string
          is_demo: boolean
          is_published: boolean
          language: string
          learning_outcomes: string[]
          level: string
          membership_discount_percent: number | null
          mode: Database["public"]["Enums"]["course_mode"]
          prerequisites: string[]
          presenter_name: string | null
          price: number
          review_note: string | null
          review_status: Database["public"]["Enums"]["content_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          starts_at: string | null
          submitted_at: string | null
          summary: string | null
          title: string
          trainer_id: string | null
          venue: string | null
        }
        SetofOptions: {
          from: "*"
          to: "courses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_provider_application: {
        Args: {
          p_bio?: string
          p_contact_email?: string
          p_contact_phone?: string
          p_credential_files?: string[]
          p_credentials_note?: string
          p_display_name: string
          p_kind: Database["public"]["Enums"]["provider_kind"]
          p_languages?: string[]
          p_license_number?: string
          p_photo_path?: string
          p_specialties?: string[]
          p_title: string
          p_years_experience?: number
        }
        Returns: {
          bio: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          credential_files: string[]
          credentials_note: string | null
          display_name: string
          id: string
          kind: Database["public"]["Enums"]["provider_kind"]
          languages: string[]
          license_number: string | null
          photo_path: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specialties: string[]
          status: Database["public"]["Enums"]["application_status"]
          title: string
          updated_at: string
          user_id: string
          years_experience: number
        }
        SetofOptions: {
          from: "*"
          to: "provider_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_support_request: {
        Args: {
          p_email: string
          p_message: string
          p_name: string
          p_phone: string
          p_subject: string
        }
        Returns: {
          created_at: string
          id: string
          status: string
        }[]
      }
      submit_training_application: {
        Args: {
          p_academic_level?: string
          p_available_from?: string
          p_available_to?: string
          p_college?: string
          p_email?: string
          p_full_name: string
          p_note?: string
          p_phone: string
          p_required_hours?: string
          p_specialty: string
          p_student_number?: string
          p_university: string
        }
        Returns: string
      }
      training_folder_open: { Args: { p_folder: string }; Returns: boolean }
      unpublish_course: {
        Args: { p_course_id: string; p_note?: string }
        Returns: undefined
      }
      withdraw_provider_application: {
        Args: { p_application_id: string }
        Returns: undefined
      }
    }
    Enums: {
      application_status: "pending" | "approved" | "rejected" | "withdrawn"
      attendance_status: "scheduled" | "present" | "absent" | "excused"
      booking_status:
        | "draft"
        | "pending_payment"
        | "confirmed"
        | "rescheduled"
        | "cancelled"
        | "completed"
        | "no_show"
        | "refunded"
        | "awaiting_approval"
      content_status: "draft" | "in_review" | "published" | "archived"
      course_mode: "onsite" | "remote" | "recorded" | "hybrid"
      delivery_mode: "remote" | "clinic"
      exercise_log_status: "pending" | "completed" | "skipped"
      notification_channel: "in_app" | "sms" | "email" | "whatsapp"
      payment_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "partially_refunded"
        | "refunded"
      provider_kind: "specialist" | "trainer"
      review_status: "pending" | "published" | "rejected" | "hidden"
      user_role:
        | "patient"
        | "student"
        | "specialist"
        | "trainer"
        | "receptionist"
        | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      application_status: ["pending", "approved", "rejected", "withdrawn"],
      attendance_status: ["scheduled", "present", "absent", "excused"],
      booking_status: [
        "draft",
        "pending_payment",
        "confirmed",
        "rescheduled",
        "cancelled",
        "completed",
        "no_show",
        "refunded",
        "awaiting_approval",
      ],
      content_status: ["draft", "in_review", "published", "archived"],
      course_mode: ["onsite", "remote", "recorded", "hybrid"],
      delivery_mode: ["remote", "clinic"],
      exercise_log_status: ["pending", "completed", "skipped"],
      notification_channel: ["in_app", "sms", "email", "whatsapp"],
      payment_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
        "partially_refunded",
        "refunded",
      ],
      provider_kind: ["specialist", "trainer"],
      review_status: ["pending", "published", "rejected", "hidden"],
      user_role: [
        "patient",
        "student",
        "specialist",
        "trainer",
        "receptionist",
        "admin",
      ],
    },
  },
} as const
