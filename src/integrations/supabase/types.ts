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
  public: {
    Tables: {
      academic_levels: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_years: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_on: string
          id: string
          name: string
          school_id: string
          starts_on: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_on: string
          id?: string
          name: string
          school_id: string
          starts_on: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_on?: string
          id?: string
          name?: string
          school_id?: string
          starts_on?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          archived_at: string | null
          audience: string
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          priority: string
          published_at: string | null
          role_code: string | null
          scheduled_for: string | null
          school_id: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          audience?: string
          body: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          published_at?: string | null
          role_code?: string | null
          scheduled_for?: string | null
          school_id: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          audience?: string
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          published_at?: string | null
          role_code?: string | null
          scheduled_for?: string | null
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assessment_rule_sets: {
        Row: {
          created_at: string
          id: string
          name: string
          rules: Json
          school_id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rules?: Json
          school_id: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rules?: Json
          school_id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_rule_sets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          bucket: string
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_name: string
          id: string
          mime_type: string | null
          owner_id: string
          owner_type: string
          path: string
          school_id: string
          size_bytes: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          bucket?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          owner_id: string
          owner_type: string
          path: string
          school_id: string
          size_bytes?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          bucket?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          owner_id?: string
          owner_type?: string
          path?: string
          school_id?: string
          size_bytes?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "attachments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: unknown
          reason: string | null
          school_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: unknown
          reason?: string | null
          school_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: unknown
          reason?: string | null
          school_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          ends_on: string | null
          event_date: string
          id: string
          school_id: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          event_date: string
          id?: string
          school_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          event_date?: string
          id?: string
          school_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string
          id: string
          school_id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feed_tokens_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_entries: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          description: string
          direction: string
          document_number: string
          id: string
          method: string
          occurred_at: string
          payment_id: string | null
          reference: string | null
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string
          description: string
          direction: string
          document_number: string
          id?: string
          method: string
          occurred_at?: string
          payment_id?: string | null
          reference?: string | null
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          direction?: string
          document_number?: string
          id?: string
          method?: string
          occurred_at?: string
          payment_id?: string | null
          reference?: string | null
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_entries_payment_fkey"
            columns: ["school_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "cash_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_groups: {
        Row: {
          academic_year_id: string
          campus_id: string | null
          capacity: number | null
          code: string
          course_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          grade_level_id: string
          id: string
          name: string
          room_id: string | null
          school_id: string
          shift: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
          whatsapp_group_name: string | null
          whatsapp_invite_url: string | null
        }
        Insert: {
          academic_year_id: string
          campus_id?: string | null
          capacity?: number | null
          code: string
          course_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grade_level_id: string
          id?: string
          name: string
          room_id?: string | null
          school_id: string
          shift: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          whatsapp_group_name?: string | null
          whatsapp_invite_url?: string | null
        }
        Update: {
          academic_year_id?: string
          campus_id?: string | null
          capacity?: number | null
          code?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grade_level_id?: string
          id?: string
          name?: string
          room_id?: string | null
          school_id?: string
          shift?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          whatsapp_group_name?: string | null
          whatsapp_invite_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_groups_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_groups_course_fkey"
            columns: ["school_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_groups_grade_fkey"
            columns: ["school_id", "grade_level_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_groups_room_fkey"
            columns: ["school_id", "room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_groups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_groups_year_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      class_schedule_slots: {
        Row: {
          class_group_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string
          id: string
          label: string | null
          school_id: string
          starts_at: string
          subject_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
          weekday: number
        }
        Insert: {
          class_group_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at: string
          id?: string
          label?: string | null
          school_id: string
          starts_at: string
          subject_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekday: number
        }
        Update: {
          class_group_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string
          id?: string
          label?: string | null
          school_id?: string
          starts_at?: string
          subject_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_schedule_slots_group_fkey"
            columns: ["school_id", "class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_schedule_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_schedule_slots_subject_fkey"
            columns: ["school_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_group_id: string
          created_at: string
          created_by: string | null
          id: string
          school_id: string
          status: string
          subject_id: string
          teacher_id: string | null
          updated_at: string
          updated_by: string | null
          weekly_periods: number
        }
        Insert: {
          class_group_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          school_id: string
          status?: string
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
          updated_by?: string | null
          weekly_periods?: number
        }
        Update: {
          class_group_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          school_id?: string
          status?: string
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
          updated_by?: string | null
          weekly_periods?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_group_id_fkey"
            columns: ["class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_status_history: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          new_status: string
          previous_status: string | null
          reason: string | null
          request_id: string
          school_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          new_status: string
          previous_status?: string | null
          reason?: string | null
          request_id: string
          school_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string | null
          reason?: string | null
          request_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_request_history_request_fkey"
            columns: ["school_id", "request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "document_request_status_history_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_on: string
          fee_amount: number
          id: string
          notes: string | null
          priority: string
          request_number: string
          requested_at: string
          school_id: string
          status: string
          student_id: string
          template_id: string
          template_name: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_on: string
          fee_amount: number
          id?: string
          notes?: string | null
          priority?: string
          request_number: string
          requested_at?: string
          school_id: string
          status: string
          student_id: string
          template_id: string
          template_name: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_on?: string
          fee_amount?: number
          id?: string
          notes?: string | null
          priority?: string
          request_number?: string
          requested_at?: string
          school_id?: string
          status?: string
          student_id?: string
          template_id?: string
          template_name?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "document_requests_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "document_requests_template_fkey"
            columns: ["school_id", "template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      document_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          fee_amount: number
          id: string
          name: string
          requires_payment: boolean
          school_id: string
          turnaround_days: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          fee_amount?: number
          id?: string
          name: string
          requires_payment?: boolean
          school_id: string
          turnaround_days?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          fee_amount?: number
          id?: string
          name?: string
          requires_payment?: boolean
          school_id?: string
          turnaround_days?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academic_year_id: string
          attendance_rate: number | null
          class_group_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          enrolled_on: string
          enrollment_number: string | null
          final_average: number | null
          id: string
          payment_status: string
          school_id: string
          status: string
          student_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          academic_year_id: string
          attendance_rate?: number | null
          class_group_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          enrolled_on?: string
          enrollment_number?: string | null
          final_average?: number | null
          id?: string
          payment_status?: string
          school_id: string
          status?: string
          student_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          academic_year_id?: string
          attendance_rate?: number | null
          class_group_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          enrolled_on?: string
          enrollment_number?: string | null
          final_average?: number | null
          id?: string
          payment_status?: string
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_group_fkey"
            columns: ["school_id", "class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "enrollments_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "enrollments_year_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      fee_items: {
        Row: {
          amount: number
          created_at: string
          fee_plan_id: string
          id: string
          is_active: boolean
          kind: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          fee_plan_id: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_plan_id?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_items_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_contracts: {
        Row: {
          created_at: string
          created_by: string | null
          discount_percentage: number
          enrollment_id: string
          fee_plan_id: string | null
          id: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_percentage?: number
          enrollment_id: string
          fee_plan_id?: string | null
          id?: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_percentage?: number
          enrollment_id?: string
          fee_plan_id?: string | null
          id?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_contracts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_contracts_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_contracts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_gateway_webhook_events: {
        Row: {
          amount: number
          channel: string
          created_at: string
          http_status: number
          id: string
          invoice_id: string | null
          message: string
          ok: boolean
          payload: Json
          reference: string
          school_id: string | null
        }
        Insert: {
          amount?: number
          channel?: string
          created_at?: string
          http_status?: number
          id?: string
          invoice_id?: string | null
          message?: string
          ok?: boolean
          payload?: Json
          reference?: string
          school_id?: string | null
        }
        Update: {
          amount?: number
          channel?: string
          created_at?: string
          http_status?: number
          id?: string
          invoice_id?: string | null
          message?: string
          ok?: boolean
          payload?: Json
          reference?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_gateway_webhook_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_invoices: {
        Row: {
          amount: number
          competence_month: string | null
          contract_id: string | null
          created_at: string
          discount_amount: number
          due_date: string
          fee_item_id: string | null
          id: string
          invoice_number: string
          issued_by: string | null
          penalty_amount: number
          school_id: string
          status: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          amount?: number
          competence_month?: string | null
          contract_id?: string | null
          created_at?: string
          discount_amount?: number
          due_date?: string
          fee_item_id?: string | null
          id?: string
          invoice_number: string
          issued_by?: string | null
          penalty_amount?: number
          school_id: string
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          competence_month?: string | null
          contract_id?: string | null
          created_at?: string
          discount_amount?: number
          due_date?: string
          fee_item_id?: string | null
          id?: string
          invoice_number?: string
          issued_by?: string | null
          penalty_amount?: number
          school_id?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "finance_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_invoices_fee_item_id_fkey"
            columns: ["fee_item_id"]
            isOneToOne: false
            referencedRelation: "fee_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payment_plans: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          id: string
          installments: number
          invoice_id: string | null
          notes: string | null
          reference: string | null
          school_id: string
          status: string
          student_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          installments?: number
          invoice_id?: string | null
          notes?: string | null
          reference?: string | null
          school_id: string
          status?: string
          student_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          installments?: number
          invoice_id?: string | null
          notes?: string | null
          reference?: string | null
          school_id?: string
          status?: string
          student_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_payment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payment_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payment_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payment_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_receipts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          paid_on: string
          payment_method: string
          receipt_number: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          paid_on?: string
          payment_method?: string
          receipt_number: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          paid_on?: string
          payment_method?: string
          receipt_number?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_receipts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_students: {
        Row: {
          full_name: string
          registration_number: string
          school_id: string
          student_id: string
          student_status: string
          updated_at: string
        }
        Insert: {
          full_name: string
          registration_number: string
          school_id: string
          student_id: string
          student_status: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          registration_number?: string
          school_id?: string
          student_id?: string
          student_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_students_school_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "finance_students_school_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      financial_reversals: {
        Row: {
          cash_entry_id: string
          created_at: string
          id: string
          payment_id: string | null
          reason: string
          reversed_by: string
          school_id: string
        }
        Insert: {
          cash_entry_id: string
          created_at?: string
          id?: string
          payment_id?: string | null
          reason: string
          reversed_by?: string
          school_id: string
        }
        Update: {
          cash_entry_id?: string
          created_at?: string
          id?: string
          payment_id?: string | null
          reason?: string
          reversed_by?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_reversals_cash_entry_fkey"
            columns: ["school_id", "cash_entry_id"]
            isOneToOne: false
            referencedRelation: "cash_entries"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "financial_reversals_payment_fkey"
            columns: ["school_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "financial_reversals_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_items: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          gradebook_id: string
          id: string
          kind: string
          max_score: number
          name: string
          school_id: string
          sequence: number
          updated_at: string
          weight: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          gradebook_id: string
          id?: string
          kind?: string
          max_score?: number
          name: string
          school_id: string
          sequence?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          gradebook_id?: string
          id?: string
          kind?: string
          max_score?: number
          name?: string
          school_id?: string
          sequence?: number
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_items_gradebook_id_fkey"
            columns: ["gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          program_id: string | null
          school_id: string
          sequence: number | null
          sort_order: number
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          program_id?: string | null
          school_id: string
          sequence?: number | null
          sort_order: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          program_id?: string | null
          school_id?: string
          sequence?: number | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_scores: {
        Row: {
          created_at: string
          enrollment_id: string
          grade_item_id: string
          id: string
          recorded_by: string | null
          school_id: string
          score: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          grade_item_id: string
          id?: string
          recorded_by?: string | null
          school_id: string
          score: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          grade_item_id?: string
          id?: string
          recorded_by?: string | null
          school_id?: string
          score?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grade_scores_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_scores_grade_item_id_fkey"
            columns: ["grade_item_id"]
            isOneToOne: false
            referencedRelation: "grade_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_scores_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      gradebooks: {
        Row: {
          academic_year_id: string | null
          class_group_id: string
          class_subject_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          opened_at: string | null
          rule_set_id: string | null
          school_id: string
          status: string
          term_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          academic_year_id?: string | null
          class_group_id: string
          class_subject_id: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          opened_at?: string | null
          rule_set_id?: string | null
          school_id: string
          status?: string
          term_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          academic_year_id?: string | null
          class_group_id?: string
          class_subject_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          opened_at?: string | null
          rule_set_id?: string | null
          school_id?: string
          status?: string
          term_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gradebooks_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_class_group_id_fkey"
            columns: ["class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "assessment_rule_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      import_audits: {
        Row: {
          action_type: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          import_job_id: string
          row_id: string | null
          table_name: string
          target_id: string
        }
        Insert: {
          action_type: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          import_job_id: string
          row_id?: string | null
          table_name: string
          target_id: string
        }
        Update: {
          action_type?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          import_job_id?: string
          row_id?: string | null
          table_name?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_audits_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_audits_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          academic_year_id: string | null
          completed_at: string | null
          created_at: string
          duplicate_rows: number
          file_name: string
          file_path: string | null
          id: string
          ignored_rows: number
          inserted_rows: number
          invalid_rows: number
          job_metadata: Json | null
          module: string
          school_id: string
          started_at: string | null
          status: string
          total_rows: number
          updated_at: string
          updated_rows: number
          user_id: string | null
          valid_rows: number
        }
        Insert: {
          academic_year_id?: string | null
          completed_at?: string | null
          created_at?: string
          duplicate_rows?: number
          file_name: string
          file_path?: string | null
          id?: string
          ignored_rows?: number
          inserted_rows?: number
          invalid_rows?: number
          job_metadata?: Json | null
          module: string
          school_id: string
          started_at?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
          updated_rows?: number
          user_id?: string | null
          valid_rows?: number
        }
        Update: {
          academic_year_id?: string | null
          completed_at?: string | null
          created_at?: string
          duplicate_rows?: number
          file_name?: string
          file_path?: string | null
          id?: string
          ignored_rows?: number
          inserted_rows?: number
          invalid_rows?: number
          job_metadata?: Json | null
          module?: string
          school_id?: string
          started_at?: string | null
          status?: string
          total_rows?: number
          updated_at?: string
          updated_rows?: number
          user_id?: string | null
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          created_at: string
          duplicate_of: string | null
          errors: Json | null
          id: string
          import_job_id: string
          normalized_data: Json
          raw_data: Json
          row_number: number
          sheet_name: string
          status: string
          target_record_id: string | null
          warnings: Json | null
        }
        Insert: {
          created_at?: string
          duplicate_of?: string | null
          errors?: Json | null
          id?: string
          import_job_id: string
          normalized_data?: Json
          raw_data?: Json
          row_number: number
          sheet_name?: string
          status?: string
          target_record_id?: string | null
          warnings?: Json | null
        }
        Update: {
          created_at?: string
          duplicate_of?: string | null
          errors?: Json | null
          id?: string
          import_job_id?: string
          normalized_data?: Json
          raw_data?: Json
          row_number?: number
          sheet_name?: string
          status?: string
          target_record_id?: string | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_templates: {
        Row: {
          created_at: string
          header_signature: Json
          id: string
          mappings: Json
          module: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          header_signature?: Json
          id?: string
          mappings?: Json
          module: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          header_signature?: Json
          id?: string
          mappings?: Json
          module?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string
          discount_amount: number
          id: string
          invoice_id: string
          line_total: number | null
          quantity: number
          school_id: string
          unit_price: number
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string
          description: string
          discount_amount?: number
          id?: string
          invoice_id: string
          line_total?: number | null
          quantity?: number
          school_id: string
          unit_price: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          discount_amount?: number
          id?: string
          invoice_id?: string
          line_total?: number | null
          quantity?: number
          school_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_fkey"
            columns: ["school_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "invoice_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          description: string | null
          discount_amount: number
          due_on: string
          enrollment_id: string | null
          id: string
          issued_on: string
          late_fee_amount: number
          number: string
          school_id: string
          status: string
          student_id: string
          subtotal: number
          total_amount: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          discount_amount?: number
          due_on: string
          enrollment_id?: string | null
          id?: string
          issued_on?: string
          late_fee_amount?: number
          number: string
          school_id: string
          status?: string
          student_id: string
          subtotal: number
          total_amount: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          discount_amount?: number
          due_on?: string
          enrollment_id?: string | null
          id?: string
          issued_on?: string
          late_fee_amount?: number
          number?: string
          school_id?: string
          status?: string
          student_id?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_enrollment_fkey"
            columns: ["school_id", "enrollment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["school_id", "id", "student_id"]
          },
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "invoices_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      member_roles: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          role_id: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          role_id: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          role_id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "school_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          school_id: string | null
          sms_enabled: boolean
          updated_at: string
          user_id: string | null
          whatsapp_enabled: boolean
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          school_id?: string | null
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string | null
          whatsapp_enabled?: boolean
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          school_id?: string | null
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string | null
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          invoice_id: string
          payment_id: string
          school_id: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          invoice_id: string
          payment_id: string
          school_id: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          invoice_id?: string
          payment_id?: string
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_fkey"
            columns: ["school_id", "invoice_id", "student_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["school_id", "id", "student_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_fkey"
            columns: ["school_id", "payment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["school_id", "id", "student_id"]
          },
          {
            foreignKeyName: "payment_allocations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_charges: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          last_webhook_at: string | null
          merchant_transaction_id: string
          method: string
          phone_number: string | null
          provider: string
          provider_charge_id: string | null
          raw_last_payload: Json | null
          receipt_number: string | null
          reconciled_at: string | null
          reference_entity: string | null
          reference_number: string | null
          school_id: string
          status: string
          status_message: string | null
          student_name: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          last_webhook_at?: string | null
          merchant_transaction_id: string
          method: string
          phone_number?: string | null
          provider?: string
          provider_charge_id?: string | null
          raw_last_payload?: Json | null
          receipt_number?: string | null
          reconciled_at?: string | null
          reference_entity?: string | null
          reference_number?: string | null
          school_id: string
          status?: string
          status_message?: string | null
          student_name?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          last_webhook_at?: string | null
          merchant_transaction_id?: string
          method?: string
          phone_number?: string | null
          provider?: string
          provider_charge_id?: string | null
          raw_last_payload?: Json | null
          receipt_number?: string | null
          reconciled_at?: string | null
          reference_entity?: string | null
          reference_number?: string | null
          school_id?: string
          status?: string
          status_message?: string | null
          student_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_charges_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: string
          id: string
          method: string
          paid_at: string
          receipt_number: string
          reference: string | null
          school_id: string
          status: string
          student_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          method: string
          paid_at?: string
          receipt_number: string
          reference?: string | null
          school_id: string
          status?: string
          student_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          method?: string
          paid_at?: string
          receipt_number?: string
          reference?: string | null
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "payments_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      people: {
        Row: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          commune: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          id: string
          internal_code: string | null
          last_name: string | null
          marital_status: string | null
          municipality: string | null
          national_id: string | null
          nationality: string | null
          nif: string | null
          notes: string | null
          phone: string | null
          phone_alternative: string | null
          phone_primary: string | null
          photo_url: string | null
          preferred_name: string | null
          profession: string | null
          province: string | null
          religion: string | null
          school_id: string
          sex: string | null
          special_needs: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          version: number
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          commune?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          id?: string
          internal_code?: string | null
          last_name?: string | null
          marital_status?: string | null
          municipality?: string | null
          national_id?: string | null
          nationality?: string | null
          nif?: string | null
          notes?: string | null
          phone?: string | null
          phone_alternative?: string | null
          phone_primary?: string | null
          photo_url?: string | null
          preferred_name?: string | null
          profession?: string | null
          province?: string | null
          religion?: string | null
          school_id: string
          sex?: string | null
          special_needs?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          version?: number
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          commune?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          internal_code?: string | null
          last_name?: string | null
          marital_status?: string | null
          municipality?: string | null
          national_id?: string | null
          nationality?: string | null
          nif?: string | null
          notes?: string | null
          phone?: string | null
          phone_alternative?: string | null
          phone_primary?: string | null
          photo_url?: string | null
          preferred_name?: string | null
          profession?: string | null
          province?: string | null
          religion?: string | null
          school_id?: string
          sex?: string | null
          special_needs?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          version?: number
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          module: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          module: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          module?: string
        }
        Relationships: []
      }
      person_documents: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_number: string
          document_type: string
          expires_at: string | null
          id: string
          issued_at: string | null
          person_id: string
          school_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_number: string
          document_type: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          person_id: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_number?: string
          document_type?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          person_id?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_documents_school_person_fkey"
            columns: ["school_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      person_relationships: {
        Row: {
          active: boolean
          authorized: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          person_id: string
          priority: number | null
          related_person_id: string
          relationship_type: string
          school_id: string
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          valid_until: string | null
          version: number
        }
        Insert: {
          active?: boolean
          authorized?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          person_id: string
          priority?: number | null
          related_person_id: string
          relationship_type: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          authorized?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          person_id?: string
          priority?: number | null
          related_person_id?: string
          relationship_type?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_relationships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_relationships_school_person_fkey"
            columns: ["school_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "person_relationships_school_related_fkey"
            columns: ["school_id", "related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      person_roles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          role: string
          school_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id: string
          role: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id?: string
          role?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_school_person_fkey"
            columns: ["school_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      person_school_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          link_type: string | null
          person_id: string
          school_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          link_type?: string | null
          person_id: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          link_type?: string | null
          person_id?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_school_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_school_links_school_person_fkey"
            columns: ["school_id", "person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cargo: string
          created_at: string
          full_name: string | null
          id: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string
          created_at?: string
          full_name?: string | null
          id: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cargo?: string
          created_at?: string
          full_name?: string | null
          id?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      program_subjects: {
        Row: {
          created_at: string
          credits: number | null
          grade_level_id: string | null
          id: string
          program_id: string
          school_id: string
          semester: number | null
          status: string
          subject_id: string
          updated_at: string
          weekly_periods: number | null
        }
        Insert: {
          created_at?: string
          credits?: number | null
          grade_level_id?: string | null
          id?: string
          program_id: string
          school_id: string
          semester?: number | null
          status?: string
          subject_id: string
          updated_at?: string
          weekly_periods?: number | null
        }
        Update: {
          created_at?: string
          credits?: number | null
          grade_level_id?: string | null
          id?: string
          program_id?: string
          school_id?: string
          semester?: number | null
          status?: string
          subject_id?: string
          updated_at?: string
          weekly_periods?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "program_subjects_grade_level_id_fkey"
            columns: ["grade_level_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_subjects_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          academic_level_id: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          academic_level_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          academic_level_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_academic_level_id_fkey"
            columns: ["academic_level_id"]
            isOneToOne: false
            referencedRelation: "academic_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          capacity?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          capacity?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_announcements: {
        Row: {
          audience: string
          body: string
          channel: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          published_at: string | null
          scheduled_for: string | null
          school_id: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          audience: string
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          published_at?: string | null
          scheduled_for?: string | null
          school_id: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          audience?: string
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          published_at?: string | null
          scheduled_for?: string | null
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_billing_settings: {
        Row: {
          created_at: string
          created_by: string | null
          due_day: number
          grace_days: number
          id: string
          late_fee_percent: number
          school_id: string
          sibling_discount_percent: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_day?: number
          grace_days?: number
          id?: string
          late_fee_percent?: number
          school_id: string
          sibling_discount_percent?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_day?: number
          grace_days?: number
          id?: string
          late_fee_percent?: number
          school_id?: string
          sibling_discount_percent?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_billing_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role_code: string
          school_id: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role_code?: string
          school_id: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role_code?: string
          school_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_invitations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_memberships: {
        Row: {
          activated_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          last_access_at: string | null
          school_id: string
          status: string
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          last_access_at?: string | null
          school_id: string
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          last_access_at?: string | null
          school_id?: string
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          changed_by: string | null
          created_at: string
          domain: string
          id: string
          school_id: string
          updated_at: string
          value: Json
          version: number
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          domain: string
          id?: string
          school_id: string
          updated_at?: string
          value?: Json
          version?: number
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          domain?: string
          id?: string
          school_id?: string
          updated_at?: string
          value?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          academic_year: string | null
          address: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          director_name: string | null
          email: string | null
          evaluation_periods: number
          id: string
          name: string
          nif: string | null
          passing_grade: number
          phone: string | null
          preferences: Json
          short_name: string | null
          slug: string | null
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          academic_year?: string | null
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          director_name?: string | null
          email?: string | null
          evaluation_periods?: number
          id?: string
          name: string
          nif?: string | null
          passing_grade?: number
          phone?: string | null
          preferences?: Json
          short_name?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          academic_year?: string | null
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          director_name?: string | null
          email?: string | null
          evaluation_periods?: number
          id?: string
          name?: string
          nif?: string | null
          passing_grade?: number
          phone?: string | null
          preferences?: Json
          short_name?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      siga_assessment_items: {
        Row: {
          allow_recovery: boolean
          assessed_on: string | null
          class_group_id: string | null
          component: string
          counts_toward_pauta: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          max_score: number
          name: string
          school_id: string
          subject_id: string | null
          term: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_recovery?: boolean
          assessed_on?: string | null
          class_group_id?: string | null
          component?: string
          counts_toward_pauta?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          max_score?: number
          name: string
          school_id: string
          subject_id?: string | null
          term: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_recovery?: boolean
          assessed_on?: string | null
          class_group_id?: string | null
          component?: string
          counts_toward_pauta?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          max_score?: number
          name?: string
          school_id?: string
          subject_id?: string | null
          term?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siga_assessment_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_assessment_scores: {
        Row: {
          enrollment_id: string
          id: string
          item_id: string
          previous_score: number | null
          recorded_by: string | null
          school_id: string
          score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          enrollment_id: string
          id?: string
          item_id: string
          previous_score?: number | null
          recorded_by?: string | null
          school_id: string
          score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          enrollment_id?: string
          id?: string
          item_id?: string
          previous_score?: number | null
          recorded_by?: string | null
          school_id?: string
          score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_assessment_scores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "siga_assessment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_assessment_scores_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_attendance_audits: {
        Row: {
          attendance_record_id: string | null
          changed_by: string
          created_at: string
          device_info: string | null
          id: string
          new_status: string
          old_status: string
          reason: string
          school_id: string
          session_id: string
          student_id: string
        }
        Insert: {
          attendance_record_id?: string | null
          changed_by: string
          created_at?: string
          device_info?: string | null
          id?: string
          new_status: string
          old_status: string
          reason: string
          school_id: string
          session_id: string
          student_id: string
        }
        Update: {
          attendance_record_id?: string | null
          changed_by?: string
          created_at?: string
          device_info?: string | null
          id?: string
          new_status?: string
          old_status?: string
          reason?: string
          school_id?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_attendance_audits_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "siga_attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_audits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_audits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "siga_attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_audits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_audits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_attendance_justifications: {
        Row: {
          attendance_record_id: string | null
          created_at: string
          file_id: string | null
          file_name: string | null
          id: string
          reason: string
          review_notes: string | null
          reviewed_by: string | null
          school_id: string
          session_id: string | null
          status: string
          student_id: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          attendance_record_id?: string | null
          created_at?: string
          file_id?: string | null
          file_name?: string | null
          id?: string
          reason: string
          review_notes?: string | null
          reviewed_by?: string | null
          school_id: string
          session_id?: string | null
          status?: string
          student_id: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          attendance_record_id?: string | null
          created_at?: string
          file_id?: string | null
          file_name?: string | null
          id?: string
          reason?: string
          review_notes?: string | null
          reviewed_by?: string | null
          school_id?: string
          session_id?: string | null
          status?: string
          student_id?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_attendance_justifications_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "siga_attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_justifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_justifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "siga_attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_justifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_justifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_attendance_records: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          recorded_by: string | null
          school_id: string
          session_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          school_id: string
          session_id: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          recorded_by?: string | null
          school_id?: string
          session_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "siga_attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_attendance_sessions: {
        Row: {
          academic_year_id: string | null
          class_group_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          lesson_date: string
          notes: string | null
          period_number: number
          school_id: string
          starts_at: string | null
          status: string
          subject_id: string
          teacher_id: string | null
          timetable_slot_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          academic_year_id?: string | null
          class_group_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          lesson_date?: string
          notes?: string | null
          period_number?: number
          school_id: string
          starts_at?: string | null
          status?: string
          subject_id: string
          teacher_id?: string | null
          timetable_slot_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          academic_year_id?: string | null
          class_group_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          lesson_date?: string
          notes?: string | null
          period_number?: number
          school_id?: string
          starts_at?: string | null
          status?: string
          subject_id?: string
          teacher_id?: string | null
          timetable_slot_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siga_attendance_sessions_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_sessions_class_group_id_fkey"
            columns: ["class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_attendance_sessions_timetable_slot_id_fkey"
            columns: ["timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_cash_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string
          document_number: string
          id: string
          method: string
          occurred_at: string
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description: string
          document_number: string
          id?: string
          method?: string
          occurred_at?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          document_number?: string
          id?: string
          method?: string
          occurred_at?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siga_cash_expenses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_module_grants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          level: string
          module_key: string
          school_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          level: string
          module_key: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          level?: string
          module_key?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_module_grants_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          authorized_pickup: boolean
          created_at: string
          created_by: string | null
          financial_responsibility: boolean
          guardian_person_id: string
          id: string
          is_pickup_authorized: boolean
          is_primary: boolean
          relationship: string
          school_id: string
          student_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          authorized_pickup?: boolean
          created_at?: string
          created_by?: string | null
          financial_responsibility?: boolean
          guardian_person_id: string
          id?: string
          is_pickup_authorized?: boolean
          is_primary?: boolean
          relationship: string
          school_id: string
          student_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          authorized_pickup?: boolean
          created_at?: string
          created_by?: string | null
          financial_responsibility?: boolean
          guardian_person_id?: string
          id?: string
          is_pickup_authorized?: boolean
          is_primary?: boolean
          relationship?: string
          school_id?: string
          student_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_person_fkey"
            columns: ["school_id", "guardian_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "student_guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "student_guardians_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      student_risk_cases: {
        Row: {
          baseline_average: number | null
          class_group_id: string | null
          class_group_name: string | null
          created_at: string
          created_by: string | null
          enrollment_id: string
          id: string
          latest_average: number | null
          reasons: Json
          risk_level: string
          school_id: string
          status: string
          student_name: string
          suggested_interventions: Json
          updated_at: string
        }
        Insert: {
          baseline_average?: number | null
          class_group_id?: string | null
          class_group_name?: string | null
          created_at?: string
          created_by?: string | null
          enrollment_id: string
          id?: string
          latest_average?: number | null
          reasons?: Json
          risk_level?: string
          school_id: string
          status?: string
          student_name: string
          suggested_interventions?: Json
          updated_at?: string
        }
        Update: {
          baseline_average?: number | null
          class_group_id?: string | null
          class_group_name?: string | null
          created_at?: string
          created_by?: string | null
          enrollment_id?: string
          id?: string
          latest_average?: number | null
          reasons?: Json
          risk_level?: string
          school_id?: string
          status?: string
          student_name?: string
          suggested_interventions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_risk_cases_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_risk_interventions: {
        Row: {
          average_snapshot: number | null
          case_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          kind: string
          outcome: string | null
          risk_level: string | null
          school_id: string
        }
        Insert: {
          average_snapshot?: number | null
          case_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          kind?: string
          outcome?: string | null
          risk_level?: string | null
          school_id: string
        }
        Update: {
          average_snapshot?: number | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          kind?: string
          outcome?: string | null
          risk_level?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_risk_interventions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "student_risk_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_risk_interventions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          previous_status: string | null
          reason: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          previous_status?: string | null
          reason?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string | null
          reason?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_status_history_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_status_history_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "student_status_history_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      students: {
        Row: {
          admission_date: string | null
          admitted_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          registration_number: string
          school_id: string
          status: string
          student_number: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          admission_date?: string | null
          admitted_on?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id: string
          registration_number: string
          school_id: string
          status?: string
          student_number?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          admission_date?: string | null
          admitted_on?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id?: string
          registration_number?: string
          school_id?: string
          status?: string
          student_number?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_person_fkey"
            columns: ["school_id", "person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          grade_from: number | null
          grade_to: number | null
          id: string
          name: string
          school_id: string
          short_name: string | null
          status: string
          teacher_name: string | null
          updated_at: string
          updated_by: string | null
          version: number
          weekly_hours: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grade_from?: number | null
          grade_to?: number | null
          id?: string
          name: string
          school_id: string
          short_name?: string | null
          status?: string
          teacher_name?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekly_hours?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grade_from?: number | null
          grade_to?: number | null
          id?: string
          name?: string
          school_id?: string
          short_name?: string | null
          status?: string
          teacher_name?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          created_by: string | null
          employee_number: string
          employment_type: string
          highest_qualification: string | null
          hired_on: string | null
          id: string
          person_id: string
          school_id: string
          specialty: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_number: string
          employment_type?: string
          highest_qualification?: string | null
          hired_on?: string | null
          id?: string
          person_id: string
          school_id: string
          specialty?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_number?: string
          employment_type?: string
          highest_qualification?: string | null
          hired_on?: string | null
          id?: string
          person_id?: string
          school_id?: string
          specialty?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      term_grades: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          enrollment_id: string
          id: string
          mac: number
          npp: number
          npt: number
          school_id: string
          subject_id: string
          term: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          enrollment_id: string
          id?: string
          mac: number
          npp: number
          npt: number
          school_id: string
          subject_id: string
          term: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          enrollment_id?: string
          id?: string
          mac?: number
          npp?: number
          npt?: number
          school_id?: string
          subject_id?: string
          term?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "term_grades_enrollment_fkey"
            columns: ["school_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "term_grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "term_grades_subject_fkey"
            columns: ["school_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          name: string
          school_id: string
          sequence: number
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          name: string
          school_id: string
          sequence: number
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          school_id?: string
          sequence?: number
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          class_subject_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          room: string
          school_id: string
          starts_at: string
          status: string
          updated_at: string
          updated_by: string | null
          weekday: number
        }
        Insert: {
          class_subject_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          room?: string
          school_id: string
          starts_at: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          weekday: number
        }
        Update: {
          class_subject_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          room?: string
          school_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      student_directory: {
        Row: {
          academic_year: string | null
          address: string | null
          attendance_rate: number | null
          birth_date: string | null
          class_code: string | null
          class_name: string | null
          course_name: string | null
          email: string | null
          enrolled_on: string | null
          enrollment_status: string | null
          final_average: number | null
          full_name: string | null
          gender: string | null
          grade_name: string | null
          id: string | null
          payment_status: string | null
          person_id: string | null
          person_version: number | null
          phone: string | null
          primary_guardian_name: string | null
          primary_guardian_phone: string | null
          registration_number: string | null
          room_name: string | null
          school_id: string | null
          shift: string | null
          student_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_person_fkey"
            columns: ["school_id", "person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
    }
    Functions: {
      can_manage_documents: { Args: never; Returns: boolean }
      can_manage_finance: { Args: never; Returns: boolean }
      can_manage_students: { Args: never; Returns: boolean }
      can_read_students: { Args: never; Returns: boolean }
      change_student_status: {
        Args: { p_new_status: string; p_reason?: string; p_student_id: string }
        Returns: {
          admission_date: string | null
          admitted_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          registration_number: string
          school_id: string
          status: string
          student_number: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_document_request: {
        Args: {
          p_due_on?: string
          p_notes?: string
          p_priority?: string
          p_request_number: string
          p_student_id: string
          p_template_id: string
        }
        Returns: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_on: string
          fee_amount: number
          id: string
          notes: string | null
          priority: string
          request_number: string
          requested_at: string
          school_id: string
          status: string
          student_id: string
          template_id: string
          template_name: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "document_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_person: {
        Args: {
          p_documents?: Json
          p_duplicate_decision?: string
          p_person: Json
          p_relationships?: Json
          p_roles?: string[]
        }
        Returns: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          commune: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          id: string
          internal_code: string | null
          last_name: string | null
          marital_status: string | null
          municipality: string | null
          national_id: string | null
          nationality: string | null
          nif: string | null
          notes: string | null
          phone: string | null
          phone_alternative: string | null
          phone_primary: string | null
          photo_url: string | null
          preferred_name: string | null
          profession: string | null
          province: string | null
          religion: string | null
          school_id: string
          sex: string | null
          special_needs: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          version: number
          whatsapp: string | null
        }
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_student: {
        Args: {
          p_academic_year_id?: string
          p_admitted_on?: string
          p_class_group_id?: string
          p_guardians?: Json
          p_person_id: string
          p_registration_number: string
        }
        Returns: {
          admission_date: string | null
          admitted_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          registration_number: string
          school_id: string
          status: string
          student_number: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_profile_role: { Args: never; Returns: string }
      current_school_id: { Args: never; Returns: string }
      enroll_new_student: {
        Args: {
          p_academic_year_id?: string
          p_admitted_on?: string
          p_class_group_id?: string
          p_duplicate_decision?: string
          p_guardians?: Json
          p_person: Json
          p_registration_number: string
        }
        Returns: {
          admission_date: string | null
          admitted_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          registration_number: string
          school_id: string
          status: string
          student_number: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enroll_student: {
        Args: {
          class_group_id: string
          enrolled_on?: string
          school_id: string
          student_id: string
        }
        Returns: Json
      }
      finance_category_summary: {
        Args: never
        Returns: {
          amount: number
          category: string
          direction: string
          entry_count: number
        }[]
      }
      finance_monthly_summary: {
        Args: { p_months?: number }
        Returns: {
          billed: number
          cash_in: number
          cash_out: number
          month_start: string
          received: number
        }[]
      }
      finance_summary: {
        Args: never
        Returns: {
          billed: number
          billed_student_count: number
          cash_balance: number
          cash_in: number
          cash_out: number
          invoice_count: number
          open_invoice_count: number
          outstanding: number
          overdue: number
          overdue_invoice_count: number
          received: number
        }[]
      }
      find_person_duplicates: {
        Args: {
          p_birth_date?: string
          p_document_number?: string
          p_email?: string
          p_full_name: string
          p_nif?: string
          p_phone?: string
        }
        Returns: {
          full_name: string
          match_reason: string
          person_id: string
          score: number
        }[]
      }
      has_school_permission: {
        Args: { p_permission: string; p_school_id: string }
        Returns: boolean
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      is_school_member: { Args: { p_school_id: string }; Returns: boolean }
      issue_invoice: {
        Args: {
          p_description: string
          p_due_on: string
          p_enrollment_id?: string
          p_issued_on?: string
          p_items: Json
          p_number: string
          p_student_id: string
        }
        Returns: {
          amount_paid: number
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          description: string | null
          discount_amount: number
          due_on: string
          enrollment_id: string | null
          id: string
          issued_on: string
          late_fee_amount: number
          number: string
          school_id: string
          status: string
          student_id: string
          subtotal: number
          total_amount: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      merge_people: {
        Args: {
          p_duplicate_id: string
          p_reason: string
          p_survivor_id: string
        }
        Returns: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          commune: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          id: string
          internal_code: string | null
          last_name: string | null
          marital_status: string | null
          municipality: string | null
          national_id: string | null
          nationality: string | null
          nif: string | null
          notes: string | null
          phone: string | null
          phone_alternative: string | null
          phone_primary: string | null
          photo_url: string | null
          preferred_name: string | null
          profession: string | null
          province: string | null
          religion: string | null
          school_id: string
          sex: string | null
          special_needs: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          version: number
          whatsapp: string | null
        }
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_school_document_number: {
        Args: { prefix: string; school_id: string }
        Returns: string
      }
      record_cash_expense: {
        Args: {
          p_amount: number
          p_category: string
          p_description: string
          p_document_number: string
          p_method: string
          p_occurred_at?: string
          p_reference?: string
        }
        Returns: {
          amount: number
          category: string
          created_at: string
          created_by: string
          description: string
          direction: string
          document_number: string
          id: string
          method: string
          occurred_at: string
          payment_id: string | null
          reference: string | null
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "cash_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_invoice_payment: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_method: string
          p_paid_at?: string
          p_receipt_number: string
          p_reference?: string
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string
          currency: string
          id: string
          method: string
          paid_at: string
          receipt_number: string
          reference: string | null
          school_id: string
          status: string
          student_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_payment: {
        Args: {
          amount: number
          invoice_id: string
          paid_on?: string
          payment_method?: string
          school_id: string
        }
        Returns: Json
      }
      register_student: {
        Args: {
          admission_date?: string
          financial_responsibility?: boolean
          guardian_person_id?: string
          person_id: string
          pickup_authorization?: boolean
          primary_guardian?: boolean
          relationship?: string
          school_id: string
        }
        Returns: Json
      }
      reverse_cash_entry: {
        Args: { p_cash_entry_id: string; p_reason: string }
        Returns: {
          cash_entry_id: string
          created_at: string
          id: string
          payment_id: string | null
          reason: string
          reversed_by: string
          school_id: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_reversals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_people: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          commune: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          id: string
          internal_code: string | null
          last_name: string | null
          marital_status: string | null
          municipality: string | null
          national_id: string | null
          nationality: string | null
          nif: string | null
          notes: string | null
          phone: string | null
          phone_alternative: string | null
          phone_primary: string | null
          photo_url: string | null
          preferred_name: string | null
          profession: string | null
          province: string | null
          religion: string | null
          school_id: string
          sex: string | null
          special_needs: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          version: number
          whatsapp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_students: {
        Args: { p_limit?: number; p_offset?: number; p_query?: string }
        Returns: {
          academic_year: string | null
          address: string | null
          attendance_rate: number | null
          birth_date: string | null
          class_code: string | null
          class_name: string | null
          course_name: string | null
          email: string | null
          enrolled_on: string | null
          enrollment_status: string | null
          final_average: number | null
          full_name: string | null
          gender: string | null
          grade_name: string | null
          id: string | null
          payment_status: string | null
          person_id: string | null
          person_version: number | null
          phone: string | null
          primary_guardian_name: string | null
          primary_guardian_phone: string | null
          registration_number: string | null
          room_name: string | null
          school_id: string | null
          shift: string | null
          student_status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "student_directory"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
