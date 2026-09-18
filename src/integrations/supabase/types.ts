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
        }
        Insert: {
          academic_year_id: string
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
        }
        Update: {
          academic_year_id?: string
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
        }
        Relationships: [
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
      enrollments: {
        Row: {
          academic_year_id: string
          attendance_rate: number | null
          class_group_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          enrolled_on: string
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
      grade_levels: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          school_id: string
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
          name: string
          school_id: string
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
          name?: string
          school_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_school_id_fkey"
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
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          internal_code: string | null
          last_name: string | null
          marital_status: string | null
          municipality: string | null
          nationality: string | null
          nif: string | null
          notes: string | null
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
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name: string
          id?: string
          internal_code?: string | null
          last_name?: string | null
          marital_status?: string | null
          municipality?: string | null
          nationality?: string | null
          nif?: string | null
          notes?: string | null
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
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          internal_code?: string | null
          last_name?: string | null
          marital_status?: string | null
          municipality?: string | null
          nationality?: string | null
          nif?: string | null
          notes?: string | null
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
          cargo: string
          created_at: string
          full_name: string | null
          id: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string
          created_at?: string
          full_name?: string | null
          id: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
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
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      student_guardians: {
        Row: {
          authorized_pickup: boolean
          created_at: string
          created_by: string | null
          guardian_person_id: string
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
          guardian_person_id: string
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
          guardian_person_id?: string
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
          admitted_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          registration_number: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          admitted_on?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id: string
          registration_number: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          admitted_on?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id?: string
          registration_number?: string
          school_id?: string
          status?: string
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
      can_manage_finance: { Args: never; Returns: boolean }
      can_manage_students: { Args: never; Returns: boolean }
      can_read_students: { Args: never; Returns: boolean }
      change_student_status: {
        Args: { p_new_status: string; p_reason?: string; p_student_id: string }
        Returns: {
          admitted_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          registration_number: string
          school_id: string
          status: string
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
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          internal_code: string | null
          last_name: string | null
          marital_status: string | null
          municipality: string | null
          nationality: string | null
          nif: string | null
          notes: string | null
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
          admitted_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          registration_number: string
          school_id: string
          status: string
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
          admitted_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          registration_number: string
          school_id: string
          status: string
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
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          internal_code: string | null
          last_name: string | null
          marital_status: string | null
          municipality: string | null
          nationality: string | null
          nif: string | null
          notes: string | null
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
      search_people: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          commune: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          internal_code: string | null
          last_name: string | null
          marital_status: string | null
          municipality: string | null
          nationality: string | null
          nif: string | null
          notes: string | null
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
