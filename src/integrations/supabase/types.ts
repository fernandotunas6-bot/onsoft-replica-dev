/**
 * Tipos gerados a partir da produção — não editar à mão.
 *
 * Regenerar com `npm run siga:gen-types` depois de qualquer migração aplicada.
 * Editar este ficheiro à mão foi como ele passou a descrever menos de metade das
 * tabelas, dando cobertura de tipos a código que falhava em execução.
 */

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
      academic_levels: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          school_id: string
          sequence: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          school_id: string
          sequence: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
          sequence?: number
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
      academic_schedules: {
        Row: {
          academic_year_id: string
          class_group_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          valid_to: string | null
          version: number
          version_number: number
        }
        Insert: {
          academic_year_id: string
          class_group_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          version?: number
          version_number?: number
        }
        Update: {
          academic_year_id?: string
          class_group_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          version?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_schedules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_schedules_class_group_id_fkey"
            columns: ["class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          name: string
          school_id: string
          starts_on: string
          status: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          name: string
          school_id: string
          starts_on: string
          status?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          name?: string
          school_id?: string
          starts_on?: string
          status?: string
          updated_by?: string | null
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
      alumni_communication_preferences: {
        Row: {
          alumni_id: string
          email_enabled: boolean
          events_enabled: boolean
          fundraising_enabled: boolean
          id: string
          mentoring_enabled: boolean
          opportunities_enabled: boolean
          school_id: string
          sms_enabled: boolean
          surveys_enabled: boolean
          updated_at: string
          whatsapp_enabled: boolean
        }
        Insert: {
          alumni_id: string
          email_enabled?: boolean
          events_enabled?: boolean
          fundraising_enabled?: boolean
          id?: string
          mentoring_enabled?: boolean
          opportunities_enabled?: boolean
          school_id: string
          sms_enabled?: boolean
          surveys_enabled?: boolean
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Update: {
          alumni_id?: string
          email_enabled?: boolean
          events_enabled?: boolean
          fundraising_enabled?: boolean
          id?: string
          mentoring_enabled?: boolean
          opportunities_enabled?: boolean
          school_id?: string
          sms_enabled?: boolean
          surveys_enabled?: boolean
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "alumni_communication_preferences_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_communication_preferences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_contributions: {
        Row: {
          alumni_id: string
          amount: number | null
          contribution_type: string
          created_at: string
          currency: string
          designation: string | null
          hours: number | null
          id: string
          metadata: Json
          notes: string | null
          occurred_at: string
          reference: string | null
          school_id: string
        }
        Insert: {
          alumni_id: string
          amount?: number | null
          contribution_type: string
          created_at?: string
          currency?: string
          designation?: string | null
          hours?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          reference?: string | null
          school_id: string
        }
        Update: {
          alumni_id?: string
          amount?: number | null
          contribution_type?: string
          created_at?: string
          currency?: string
          designation?: string | null
          hours?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          reference?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_contributions_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_contributions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_education_stages: {
        Row: {
          alumni_id: string
          city: string | null
          country: string | null
          course_name: string | null
          created_at: string
          degree_name: string | null
          education_level: string
          ended_year: number | null
          id: string
          institution_name: string
          is_current: boolean
          is_verified: boolean
          metadata: Json
          province: string | null
          school_id: string
          sort_order: number
          started_year: number | null
          updated_at: string
        }
        Insert: {
          alumni_id: string
          city?: string | null
          country?: string | null
          course_name?: string | null
          created_at?: string
          degree_name?: string | null
          education_level: string
          ended_year?: number | null
          id?: string
          institution_name: string
          is_current?: boolean
          is_verified?: boolean
          metadata?: Json
          province?: string | null
          school_id: string
          sort_order?: number
          started_year?: number | null
          updated_at?: string
        }
        Update: {
          alumni_id?: string
          city?: string | null
          country?: string | null
          course_name?: string | null
          created_at?: string
          degree_name?: string | null
          education_level?: string
          ended_year?: number | null
          id?: string
          institution_name?: string
          is_current?: boolean
          is_verified?: boolean
          metadata?: Json
          province?: string | null
          school_id?: string
          sort_order?: number
          started_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_education_stages_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_education_stages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_engagements: {
        Row: {
          alumni_id: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          notes: string | null
          occurred_at: string
          school_id: string
          title: string
          value_numeric: number | null
        }
        Insert: {
          alumni_id: string
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          school_id: string
          title: string
          value_numeric?: number | null
        }
        Update: {
          alumni_id?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          notes?: string | null
          occurred_at?: string
          school_id?: string
          title?: string
          value_numeric?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alumni_engagements_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_engagements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_event_registrations: {
        Row: {
          alumni_id: string
          checked_in_at: string | null
          event_id: string
          id: string
          metadata: Json
          registered_at: string
          school_id: string
          status: string
        }
        Insert: {
          alumni_id: string
          checked_in_at?: string | null
          event_id: string
          id?: string
          metadata?: Json
          registered_at?: string
          school_id: string
          status?: string
        }
        Update: {
          alumni_id?: string
          checked_in_at?: string | null
          event_id?: string
          id?: string
          metadata?: Json
          registered_at?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_event_registrations_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "alumni_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_event_registrations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_events: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          ends_at: string | null
          event_type: string
          id: string
          location: string | null
          metadata: Json
          online_url: string | null
          school_id: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          metadata?: Json
          online_url?: string | null
          school_id: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          metadata?: Json
          online_url?: string | null
          school_id?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_experiences: {
        Row: {
          alumni_id: string
          created_at: string
          description: string | null
          ended_on: string | null
          field: string | null
          id: string
          is_current: boolean
          kind: string
          location: string | null
          organization: string
          school_id: string
          started_on: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          alumni_id: string
          created_at?: string
          description?: string | null
          ended_on?: string | null
          field?: string | null
          id?: string
          is_current?: boolean
          kind: string
          location?: string | null
          organization: string
          school_id: string
          started_on?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          alumni_id?: string
          created_at?: string
          description?: string | null
          ended_on?: string | null
          field?: string | null
          id?: string
          is_current?: boolean
          kind?: string
          location?: string | null
          organization?: string
          school_id?: string
          started_on?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_experiences_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_experiences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_mentorships: {
        Row: {
          completed_at: string | null
          created_at: string
          focus_area: string
          id: string
          mentee_alumni_id: string
          mentor_alumni_id: string
          metadata: Json
          notes: string | null
          requested_at: string
          school_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          focus_area: string
          id?: string
          mentee_alumni_id: string
          mentor_alumni_id: string
          metadata?: Json
          notes?: string | null
          requested_at?: string
          school_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          focus_area?: string
          id?: string
          mentee_alumni_id?: string
          mentor_alumni_id?: string
          metadata?: Json
          notes?: string | null
          requested_at?: string
          school_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_mentorships_mentee_alumni_id_fkey"
            columns: ["mentee_alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_mentorships_mentor_alumni_id_fkey"
            columns: ["mentor_alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_mentorships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_opportunities: {
        Row: {
          application_url: string | null
          created_at: string
          created_by_alumni_id: string | null
          description: string | null
          expires_at: string | null
          id: string
          location: string | null
          metadata: Json
          opportunity_type: string
          organization: string | null
          remote_allowed: boolean
          school_id: string
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          application_url?: string | null
          created_at?: string
          created_by_alumni_id?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          opportunity_type?: string
          organization?: string | null
          remote_allowed?: boolean
          school_id: string
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          application_url?: string | null
          created_at?: string
          created_by_alumni_id?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          opportunity_type?: string
          organization?: string | null
          remote_allowed?: boolean
          school_id?: string
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_opportunities_created_by_alumni_id_fkey"
            columns: ["created_by_alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_opportunities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_opportunity_applications: {
        Row: {
          alumni_id: string
          applied_at: string | null
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          opportunity_id: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          alumni_id: string
          applied_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          opportunity_id: string
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          alumni_id?: string
          applied_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          opportunity_id?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_opportunity_applications_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_opportunity_applications_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "alumni_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_opportunity_applications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_portfolio_items: {
        Row: {
          alumni_id: string
          created_at: string
          education_level: string | null
          education_stage_id: string | null
          ended_on: string | null
          external_url: string | null
          featured: boolean
          id: string
          image_url: string | null
          item_type: string
          metadata: Json
          official_document_request_id: string | null
          organization: string | null
          role: string | null
          school_id: string
          skills: string[]
          sort_order: number
          started_on: string | null
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          alumni_id: string
          created_at?: string
          education_level?: string | null
          education_stage_id?: string | null
          ended_on?: string | null
          external_url?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          item_type: string
          metadata?: Json
          official_document_request_id?: string | null
          organization?: string | null
          role?: string | null
          school_id: string
          skills?: string[]
          sort_order?: number
          started_on?: string | null
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          alumni_id?: string
          created_at?: string
          education_level?: string | null
          education_stage_id?: string | null
          ended_on?: string | null
          external_url?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          item_type?: string
          metadata?: Json
          official_document_request_id?: string | null
          organization?: string | null
          role?: string | null
          school_id?: string
          skills?: string[]
          sort_order?: number
          started_on?: string | null
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_portfolio_items_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_portfolio_items_education_stage_id_fkey"
            columns: ["education_stage_id"]
            isOneToOne: false
            referencedRelation: "alumni_education_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_portfolio_items_official_document_request_id_fkey"
            columns: ["official_document_request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_portfolio_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_privacy_audit: {
        Row: {
          action: string
          alumni_id: string
          auth_user_id: string | null
          id: string
          metadata: Json
          new_value: Json | null
          occurred_at: string
          previous_value: Json | null
          school_id: string
        }
        Insert: {
          action: string
          alumni_id: string
          auth_user_id?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          occurred_at?: string
          previous_value?: Json | null
          school_id: string
        }
        Update: {
          action?: string
          alumni_id?: string
          auth_user_id?: string | null
          id?: string
          metadata?: Json
          new_value?: Json | null
          occurred_at?: string
          previous_value?: Json | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_privacy_audit_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_privacy_audit_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_profiles: {
        Row: {
          auth_user_id: string | null
          available_for_mentoring: boolean
          biography: string | null
          city: string | null
          contact_consent: boolean
          country: string | null
          created_at: string
          current_company: string | null
          current_role: string | null
          directory_visibility: string
          employment_status: string
          graduation_course: string | null
          graduation_grade: string | null
          graduation_year: number | null
          headline: string | null
          id: string
          industry: string | null
          interests: string[]
          last_engagement_at: string | null
          linkedin_url: string | null
          metadata: Json
          open_to_opportunities: boolean
          person_id: string
          profile_completion: number
          province: string | null
          school_id: string
          seeking_mentor: boolean
          self_service_claimed_at: string | null
          self_service_enabled: boolean
          skills: string[]
          student_id: string
          updated_at: string
          verified_at: string | null
          website_url: string | null
        }
        Insert: {
          auth_user_id?: string | null
          available_for_mentoring?: boolean
          biography?: string | null
          city?: string | null
          contact_consent?: boolean
          country?: string | null
          created_at?: string
          current_company?: string | null
          current_role?: string | null
          directory_visibility?: string
          employment_status?: string
          graduation_course?: string | null
          graduation_grade?: string | null
          graduation_year?: number | null
          headline?: string | null
          id?: string
          industry?: string | null
          interests?: string[]
          last_engagement_at?: string | null
          linkedin_url?: string | null
          metadata?: Json
          open_to_opportunities?: boolean
          person_id: string
          profile_completion?: number
          province?: string | null
          school_id: string
          seeking_mentor?: boolean
          self_service_claimed_at?: string | null
          self_service_enabled?: boolean
          skills?: string[]
          student_id: string
          updated_at?: string
          verified_at?: string | null
          website_url?: string | null
        }
        Update: {
          auth_user_id?: string | null
          available_for_mentoring?: boolean
          biography?: string | null
          city?: string | null
          contact_consent?: boolean
          country?: string | null
          created_at?: string
          current_company?: string | null
          current_role?: string | null
          directory_visibility?: string
          employment_status?: string
          graduation_course?: string | null
          graduation_grade?: string | null
          graduation_year?: number | null
          headline?: string | null
          id?: string
          industry?: string | null
          interests?: string[]
          last_engagement_at?: string | null
          linkedin_url?: string | null
          metadata?: Json
          open_to_opportunities?: boolean
          person_id?: string
          profile_completion?: number
          province?: string | null
          school_id?: string
          seeking_mentor?: boolean
          self_service_claimed_at?: string | null
          self_service_enabled?: boolean
          skills?: string[]
          student_id?: string
          updated_at?: string
          verified_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alumni_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_survey_responses: {
        Row: {
          alumni_id: string
          id: string
          response_json: Json
          school_id: string
          submitted_at: string
          survey_id: string
        }
        Insert: {
          alumni_id: string
          id?: string
          response_json?: Json
          school_id: string
          submitted_at?: string
          survey_id: string
        }
        Update: {
          alumni_id?: string
          id?: string
          response_json?: Json
          school_id?: string
          submitted_at?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_survey_responses_alumni_id_fkey"
            columns: ["alumni_id"]
            isOneToOne: false
            referencedRelation: "alumni_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_survey_responses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "alumni_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_surveys: {
        Row: {
          closes_at: string | null
          created_at: string
          description: string | null
          id: string
          opens_at: string | null
          purpose: string
          schema_json: Json
          school_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opens_at?: string | null
          purpose?: string
          schema_json?: Json
          school_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          opens_at?: string | null
          purpose?: string
          schema_json?: Json
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_surveys_school_id_fkey"
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
          class_group_id: string | null
          created_at: string
          created_by: string
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
          class_group_id?: string | null
          created_at?: string
          created_by: string
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
          class_group_id?: string | null
          created_at?: string
          created_by?: string
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
            foreignKeyName: "announcements_class_fk"
            columns: ["school_id", "class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_key_subjects: {
        Row: {
          created_at: string
          id: string
          rule_set_id: string
          school_id: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rule_set_id: string
          school_id: string
          subject_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rule_set_id?: string
          school_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_key_subjects_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "assessment_rule_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_key_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_key_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_rule_sets: {
        Row: {
          code: string
          continuous_weight: number
          created_at: string
          created_by: string | null
          exam_weight: number
          formula: Json | null
          grade_change_requires_approval: boolean
          grading_scale_id: string
          id: string
          lock_after_publication: boolean
          maximum_absence_percentage: number
          name: string
          passing_value: number
          rounding_method: string
          school_id: string
          status: string
          version: number
        }
        Insert: {
          code?: string
          continuous_weight: number
          created_at?: string
          created_by?: string | null
          exam_weight: number
          formula?: Json | null
          grade_change_requires_approval?: boolean
          grading_scale_id: string
          id?: string
          lock_after_publication?: boolean
          maximum_absence_percentage: number
          name: string
          passing_value: number
          rounding_method?: string
          school_id: string
          status?: string
          version?: number
        }
        Update: {
          code?: string
          continuous_weight?: number
          created_at?: string
          created_by?: string | null
          exam_weight?: number
          formula?: Json | null
          grade_change_requires_approval?: boolean
          grading_scale_id?: string
          id?: string
          lock_after_publication?: boolean
          maximum_absence_percentage?: number
          name?: string
          passing_value?: number
          rounding_method?: string
          school_id?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_rule_sets_grading_scale_id_fkey"
            columns: ["grading_scale_id"]
            isOneToOne: false
            referencedRelation: "grading_scales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_rule_sets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_session_id: string
          created_at: string
          enrollment_id: string
          id: string
          minutes_late: number
          note: string | null
          recorded_by: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attendance_session_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          minutes_late?: number
          note?: string | null
          recorded_by: string
          school_id: string
          status: string
          updated_at?: string
        }
        Update: {
          attendance_session_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          minutes_late?: number
          note?: string | null
          recorded_by?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_roster_fkey"
            columns: ["school_id", "attendance_session_id", "enrollment_id"]
            isOneToOne: true
            referencedRelation: "attendance_session_roster"
            referencedColumns: [
              "school_id",
              "attendance_session_id",
              "enrollment_id",
            ]
          },
          {
            foreignKeyName: "attendance_records_school_id_attendance_session_id_fkey"
            columns: ["school_id", "attendance_session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_records_school_id_enrollment_id_fkey"
            columns: ["school_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_session_roster: {
        Row: {
          attendance_session_id: string
          captured_at: string
          enrollment_id: string
          school_id: string
        }
        Insert: {
          attendance_session_id: string
          captured_at?: string
          enrollment_id: string
          school_id: string
        }
        Update: {
          attendance_session_id?: string
          captured_at?: string
          enrollment_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_session_roster_school_id_attendance_session_id_fkey"
            columns: ["school_id", "attendance_session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_session_roster_school_id_enrollment_id_fkey"
            columns: ["school_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_session_roster_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          class_subject_id: string
          created_at: string
          id: string
          opened_by: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          school_id: string
          session_date: string
          status: string
          submission_key: string | null
          submitted_at: string | null
          submitted_by: string | null
          timetable_slot_id: string
          updated_at: string
        }
        Insert: {
          class_subject_id: string
          created_at?: string
          id?: string
          opened_by: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          school_id: string
          session_date: string
          status?: string
          submission_key?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          timetable_slot_id: string
          updated_at?: string
        }
        Update: {
          class_subject_id?: string
          created_at?: string
          id?: string
          opened_by?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          school_id?: string
          session_date?: string
          status?: string
          submission_key?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          timetable_slot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_school_id_class_subject_id_fkey"
            columns: ["school_id", "class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_school_id_timetable_slot_id_fkey"
            columns: ["school_id", "timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "attendance_sessions_slot_assignment_fkey"
            columns: ["school_id", "timetable_slot_id", "class_subject_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["school_id", "id", "class_subject_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          occurred_at: string
          request_id: string | null
          school_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: never
          metadata?: Json
          occurred_at?: string
          request_id?: string | null
          school_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: never
          metadata?: Json
          occurred_at?: string
          request_id?: string | null
          school_id?: string
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
          municipality: string | null
          name: string
          province: string | null
          school_id: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          municipality?: string | null
          name: string
          province?: string | null
          school_id: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          municipality?: string | null
          name?: string
          province?: string | null
          school_id?: string
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
      class_groups: {
        Row: {
          academic_year_id: string
          campus_id: string
          capacity: number
          code: string
          created_at: string
          created_by: string
          delegate_student_id: string | null
          grade_level_id: string
          homeroom_teacher_id: string | null
          id: string
          name: string
          school_id: string
          shift: string
          status: string
          updated_at: string
          updated_by: string
          whatsapp_group_name: string | null
          whatsapp_invite_url: string | null
        }
        Insert: {
          academic_year_id: string
          campus_id: string
          capacity: number
          code: string
          created_at?: string
          created_by: string
          delegate_student_id?: string | null
          grade_level_id: string
          homeroom_teacher_id?: string | null
          id?: string
          name: string
          school_id: string
          shift: string
          status?: string
          updated_at?: string
          updated_by: string
          whatsapp_group_name?: string | null
          whatsapp_invite_url?: string | null
        }
        Update: {
          academic_year_id?: string
          campus_id?: string
          capacity?: number
          code?: string
          created_at?: string
          created_by?: string
          delegate_student_id?: string | null
          grade_level_id?: string
          homeroom_teacher_id?: string | null
          id?: string
          name?: string
          school_id?: string
          shift?: string
          status?: string
          updated_at?: string
          updated_by?: string
          whatsapp_group_name?: string | null
          whatsapp_invite_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_groups_delegate_student_fk"
            columns: ["school_id", "delegate_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_groups_school_id_academic_year_id_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_groups_school_id_campus_id_fkey"
            columns: ["school_id", "campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
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
            foreignKeyName: "class_groups_school_id_grade_level_id_fkey"
            columns: ["school_id", "grade_level_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_groups_school_id_homeroom_teacher_id_fkey"
            columns: ["school_id", "homeroom_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_group_id: string
          created_at: string
          created_by: string
          id: string
          school_id: string
          status: string
          subject_id: string
          teacher_id: string | null
          updated_at: string
          updated_by: string
          weekly_periods: number
        }
        Insert: {
          class_group_id: string
          created_at?: string
          created_by: string
          id?: string
          school_id: string
          status?: string
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
          updated_by: string
          weekly_periods: number
        }
        Update: {
          class_group_id?: string
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          status?: string
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
          updated_by?: string
          weekly_periods?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_school_id_class_group_id_fkey"
            columns: ["school_id", "class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_subject_id_fkey"
            columns: ["school_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "class_subjects_school_id_teacher_id_fkey"
            columns: ["school_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      communication_dispatches: {
        Row: {
          channel: Database["public"]["Enums"]["communication_channel"]
          created_at: string
          delivered_at: string | null
          error_details: string | null
          external_message_id: string | null
          id: string
          metadata: Json | null
          provider: string
          recipient: string
          school_id: string | null
          sender_address: string
          status: Database["public"]["Enums"]["dispatch_status"]
          subject_or_template: string | null
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          delivered_at?: string | null
          error_details?: string | null
          external_message_id?: string | null
          id?: string
          metadata?: Json | null
          provider: string
          recipient: string
          school_id?: string | null
          sender_address: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          subject_or_template?: string | null
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          delivered_at?: string | null
          error_details?: string | null
          external_message_id?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          recipient?: string
          school_id?: string | null
          sender_address?: string
          status?: Database["public"]["Enums"]["dispatch_status"]
          subject_or_template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_dispatches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_events: {
        Row: {
          dispatch_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          provider: string
        }
        Insert: {
          dispatch_id?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          payload: Json
          provider: string
        }
        Update: {
          dispatch_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_events_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "communication_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_verification_profiles: {
        Row: {
          created_at: string
          email_address: string | null
          email_verified: boolean
          email_verified_at: string | null
          id: string
          last_email_sent_at: string | null
          last_sms_sent_at: string | null
          last_whatsapp_sent_at: string | null
          phone_number: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          preferred_communication_channel: Database["public"]["Enums"]["communication_channel"]
          preferred_language: string
          school_id: string | null
          updated_at: string
          user_id: string
          version: number
          whatsapp_number: string | null
          whatsapp_verified: boolean
          whatsapp_verified_at: string | null
        }
        Insert: {
          created_at?: string
          email_address?: string | null
          email_verified?: boolean
          email_verified_at?: string | null
          id?: string
          last_email_sent_at?: string | null
          last_sms_sent_at?: string | null
          last_whatsapp_sent_at?: string | null
          phone_number?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          preferred_communication_channel?: Database["public"]["Enums"]["communication_channel"]
          preferred_language?: string
          school_id?: string | null
          updated_at?: string
          user_id: string
          version?: number
          whatsapp_number?: string | null
          whatsapp_verified?: boolean
          whatsapp_verified_at?: string | null
        }
        Update: {
          created_at?: string
          email_address?: string | null
          email_verified?: boolean
          email_verified_at?: string | null
          id?: string
          last_email_sent_at?: string | null
          last_sms_sent_at?: string | null
          last_whatsapp_sent_at?: string | null
          phone_number?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          preferred_communication_channel?: Database["public"]["Enums"]["communication_channel"]
          preferred_language?: string
          school_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number
          whatsapp_number?: string | null
          whatsapp_verified?: boolean
          whatsapp_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_verification_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      curricula: {
        Row: {
          academic_year_id: string
          course_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          grade_level_id: string
          id: string
          name: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          academic_year_id: string
          course_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          grade_level_id: string
          id?: string
          name: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          academic_year_id?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          grade_level_id?: string
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
            foreignKeyName: "curricula_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curricula_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curricula_grade_level_id_fkey"
            columns: ["grade_level_id"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curricula_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_areas: {
        Row: {
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          display_order: number
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
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
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
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
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
            foreignKeyName: "curriculum_areas_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_subjects: {
        Row: {
          created_at: string
          created_by: string | null
          curriculum_id: string
          deleted_at: string | null
          display_order: number
          id: string
          is_mandatory: boolean
          period_duration_minutes: number
          school_id: string
          subject_id: string
          subject_type_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
          weekly_periods: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          curriculum_id: string
          deleted_at?: string | null
          display_order?: number
          id?: string
          is_mandatory?: boolean
          period_duration_minutes?: number
          school_id: string
          subject_id: string
          subject_type_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekly_periods?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          curriculum_id?: string
          deleted_at?: string | null
          display_order?: number
          id?: string
          is_mandatory?: boolean
          period_duration_minutes?: number
          school_id?: string
          subject_id?: string
          subject_type_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekly_periods?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_subjects_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_subjects_subject_type_id_fkey"
            columns: ["subject_type_id"]
            isOneToOne: false
            referencedRelation: "subject_types"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          created_at: string
          id: string
          purpose: string
          request_type: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
          student_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          purpose: string
          request_type: string
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
          student_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          purpose?: string
          request_type?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
          student_id?: string
          template_id?: string | null
          updated_at?: string
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
            foreignKeyName: "document_requests_school_id_student_id_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "document_requests_school_id_template_id_fkey"
            columns: ["school_id", "template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          document_type: string
          id: string
          next_number: number
          padding: number
          prefix: string
          school_id: string
          updated_at: string
        }
        Insert: {
          document_type: string
          id?: string
          next_number?: number
          padding?: number
          prefix: string
          school_id: string
          updated_at?: string
        }
        Update: {
          document_type?: string
          id?: string
          next_number?: number
          padding?: number
          prefix?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          created_at: string
          id: string
          issued_document_id: string
          note: string | null
          requested_by: string
          school_id: string
          signer_role: string
          status: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          created_at?: string
          id?: string
          issued_document_id: string
          note?: string | null
          requested_by: string
          school_id: string
          signer_role: string
          status?: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          created_at?: string
          id?: string
          issued_document_id?: string
          note?: string | null
          requested_by?: string
          school_id?: string
          signer_role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_school_id_issued_document_id_fkey"
            columns: ["school_id", "issued_document_id"]
            isOneToOne: false
            referencedRelation: "issued_documents"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      document_templates: {
        Row: {
          allowed_fields: Json
          body_template: string
          code: string
          created_at: string
          created_by: string
          document_type: string
          id: string
          name: string
          school_id: string
          status: string
          version: number
        }
        Insert: {
          allowed_fields?: Json
          body_template: string
          code: string
          created_at?: string
          created_by: string
          document_type: string
          id?: string
          name: string
          school_id: string
          status?: string
          version: number
        }
        Update: {
          allowed_fields?: Json
          body_template?: string
          code?: string
          created_at?: string
          created_by?: string
          document_type?: string
          id?: string
          name?: string
          school_id?: string
          status?: string
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
      email_aliases: {
        Row: {
          alias_address: string
          created_at: string
          id: string
          mailbox_id: string
        }
        Insert: {
          alias_address: string
          created_at?: string
          id?: string
          mailbox_id: string
        }
        Update: {
          alias_address?: string
          created_at?: string
          id?: string
          mailbox_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_aliases_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_applications: {
        Row: {
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          deleted_at: string | null
          form_id: string
          full_name: string
          id: string
          payload: Json
          school_id: string
          status: string
          student_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          deleted_at?: string | null
          form_id: string
          full_name: string
          id?: string
          payload?: Json
          school_id: string
          status?: string
          student_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          deleted_at?: string | null
          form_id?: string
          full_name?: string
          id?: string
          payload?: Json
          school_id?: string
          status?: string
          student_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_applications_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "enrollment_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_applications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_forms: {
        Row: {
          accent_color: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          hero_text: string | null
          id: string
          is_open: boolean
          logo_url: string | null
          school_id: string
          slug: string
          subtitle: string | null
          title: string
          updated_at: string
          updated_by: string | null
          version: number
          visible_fields: Json
        }
        Insert: {
          accent_color?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          hero_text?: string | null
          id?: string
          is_open?: boolean
          logo_url?: string | null
          school_id: string
          slug: string
          subtitle?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visible_fields?: Json
        }
        Update: {
          accent_color?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          hero_text?: string | null
          id?: string
          is_open?: boolean
          logo_url?: string | null
          school_id?: string
          slug?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visible_fields?: Json
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_forms_school_id_fkey"
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
          created_by: string
          end_reason: string | null
          ended_on: string | null
          enrolled_on: string
          enrollment_number: string
          final_average: number | null
          id: string
          school_id: string
          status: string
          student_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          academic_year_id: string
          attendance_rate?: number | null
          class_group_id: string
          created_at?: string
          created_by: string
          end_reason?: string | null
          ended_on?: string | null
          enrolled_on: string
          enrollment_number: string
          final_average?: number | null
          id?: string
          school_id: string
          status?: string
          student_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          academic_year_id?: string
          attendance_rate?: number | null
          class_group_id?: string
          created_at?: string
          created_by?: string
          end_reason?: string | null
          ended_on?: string | null
          enrolled_on?: string
          enrollment_number?: string
          final_average?: number | null
          id?: string
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_school_id_academic_year_id_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "enrollments_school_id_class_group_id_fkey"
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
            foreignKeyName: "enrollments_school_id_student_id_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      fee_items: {
        Row: {
          amount: number
          code: string
          created_at: string
          fee_plan_id: string
          frequency: string
          id: string
          is_active: boolean
          kind: string
          name: string
          school_id: string
        }
        Insert: {
          amount: number
          code: string
          created_at?: string
          fee_plan_id: string
          frequency: string
          id?: string
          is_active?: boolean
          kind: string
          name: string
          school_id: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          fee_plan_id?: string
          frequency?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_items_school_id_fee_plan_id_fkey"
            columns: ["school_id", "fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["school_id", "id"]
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
          academic_year_id: string
          code: string
          created_at: string
          currency_code: string
          id: string
          name: string
          school_id: string
          status: string
        }
        Insert: {
          academic_year_id: string
          code: string
          created_at?: string
          currency_code?: string
          id?: string
          name: string
          school_id: string
          status?: string
        }
        Update: {
          academic_year_id?: string
          code?: string
          created_at?: string
          currency_code?: string
          id?: string
          name?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_plans_school_id_academic_year_id_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
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
          created_by: string
          discount_percentage: number
          enrollment_id: string
          fee_plan_id: string
          id: string
          school_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          discount_percentage?: number
          enrollment_id: string
          fee_plan_id: string
          id?: string
          school_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          discount_percentage?: number
          enrollment_id?: string
          fee_plan_id?: string
          id?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_contracts_school_id_enrollment_id_fkey"
            columns: ["school_id", "enrollment_id"]
            isOneToOne: true
            referencedRelation: "enrollments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "finance_contracts_school_id_fee_plan_id_fkey"
            columns: ["school_id", "fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["school_id", "id"]
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
          amount: number | null
          channel: string
          created_at: string
          dev_mode: boolean
          external_id: string | null
          http_status: number
          id: string
          invoice_id: string | null
          message: string | null
          ok: boolean
          provider: string | null
          reference: string | null
          school_id: string | null
        }
        Insert: {
          amount?: number | null
          channel: string
          created_at?: string
          dev_mode?: boolean
          external_id?: string | null
          http_status: number
          id?: string
          invoice_id?: string | null
          message?: string | null
          ok: boolean
          provider?: string | null
          reference?: string | null
          school_id?: string | null
        }
        Update: {
          amount?: number | null
          channel?: string
          created_at?: string
          dev_mode?: boolean
          external_id?: string | null
          http_status?: number
          id?: string
          invoice_id?: string | null
          message?: string | null
          ok?: boolean
          provider?: string | null
          reference?: string | null
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
      finance_invoice_events: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          invoice_id: string
          reason: string | null
          school_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          invoice_id: string
          reason?: string | null
          school_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          invoice_id?: string
          reason?: string | null
          school_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_invoice_events_school_id_fkey"
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
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          competence_month: string | null
          contract_id: string
          created_at: string
          discount_amount: number
          due_date: string
          fee_item_id: string
          id: string
          invoice_number: string
          issued_by: string
          penalty_amount: number
          school_id: string
          status: string
        }
        Insert: {
          amount: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          competence_month?: string | null
          contract_id: string
          created_at?: string
          discount_amount?: number
          due_date: string
          fee_item_id: string
          id?: string
          invoice_number: string
          issued_by: string
          penalty_amount?: number
          school_id: string
          status?: string
        }
        Update: {
          amount?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          competence_month?: string | null
          contract_id?: string
          created_at?: string
          discount_amount?: number
          due_date?: string
          fee_item_id?: string
          id?: string
          invoice_number?: string
          issued_by?: string
          penalty_amount?: number
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_invoices_school_id_contract_id_fkey"
            columns: ["school_id", "contract_id"]
            isOneToOne: false
            referencedRelation: "finance_contracts"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "finance_invoices_school_id_fee_item_id_fkey"
            columns: ["school_id", "fee_item_id"]
            isOneToOne: false
            referencedRelation: "fee_items"
            referencedColumns: ["school_id", "id"]
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
            foreignKeyName: "finance_payment_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_receipts: {
        Row: {
          amount: number
          created_at: string
          external_id: string | null
          id: string
          invoice_id: string
          paid_on: string
          payment_method: string
          receipt_number: string
          received_by: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          school_id: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          external_id?: string | null
          id?: string
          invoice_id: string
          paid_on: string
          payment_method: string
          receipt_number: string
          received_by: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          school_id: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          external_id?: string | null
          id?: string
          invoice_id?: string
          paid_on?: string
          payment_method?: string
          receipt_number?: string
          received_by?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_receipts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_receipts_school_id_invoice_id_fkey"
            columns: ["school_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_invoices"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      financial_rule_sets: {
        Row: {
          code: string
          created_at: string
          created_by: string
          currency_code: string
          id: string
          late_penalty_kind: string
          late_penalty_value: number
          maximum_discount_percentage: number
          monthly_due_day: number
          school_id: string
          status: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          currency_code?: string
          id?: string
          late_penalty_kind: string
          late_penalty_value: number
          maximum_discount_percentage: number
          monthly_due_day: number
          school_id: string
          status: string
          version: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          currency_code?: string
          id?: string
          late_penalty_kind?: string
          late_penalty_value?: number
          maximum_discount_percentage?: number
          monthly_due_day?: number
          school_id?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_rule_sets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      google_workspace_connections: {
        Row: {
          account_email: string | null
          connected_at: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          expires_at: string
          google_sub: string
          granted_scopes: string[]
          id: string
          revoked_at: string | null
          school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          connected_at?: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          expires_at: string
          google_sub: string
          granted_scopes?: string[]
          id?: string
          revoked_at?: string | null
          school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          connected_at?: string
          encrypted_access_token?: string
          encrypted_refresh_token?: string
          expires_at?: string
          google_sub?: string
          granted_scopes?: string[]
          id?: string
          revoked_at?: string | null
          school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_workspace_connections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      google_workspace_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          encrypted_verifier: string
          expires_at: string
          redirect_uri: string
          requested_services: string[]
          school_id: string
          session_id: string
          state_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          encrypted_verifier: string
          expires_at: string
          redirect_uri: string
          requested_services: string[]
          school_id: string
          session_id: string
          state_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          encrypted_verifier?: string
          expires_at?: string
          redirect_uri?: string
          requested_services?: string[]
          school_id?: string
          session_id?: string
          state_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_workspace_oauth_states_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_items: {
        Row: {
          assessed_on: string | null
          code: string
          created_at: string
          created_by: string
          gradebook_id: string
          id: string
          kind: string
          max_score: number
          name: string
          school_id: string
          sequence: number
          weight: number
        }
        Insert: {
          assessed_on?: string | null
          code: string
          created_at?: string
          created_by: string
          gradebook_id: string
          id?: string
          kind: string
          max_score: number
          name: string
          school_id: string
          sequence?: number
          weight?: number
        }
        Update: {
          assessed_on?: string | null
          code?: string
          created_at?: string
          created_by?: string
          gradebook_id?: string
          id?: string
          kind?: string
          max_score?: number
          name?: string
          school_id?: string
          sequence?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_items_school_id_gradebook_id_fkey"
            columns: ["school_id", "gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          program_id: string
          school_id: string
          sequence: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          program_id: string
          school_id: string
          sequence?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          program_id?: string
          school_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_levels_school_id_program_id_fkey"
            columns: ["school_id", "program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      grade_scores: {
        Row: {
          created_at: string
          enrollment_id: string
          grade_item_id: string
          id: string
          note: string | null
          pending_reason: string | null
          pending_requested_at: string | null
          pending_requested_by: string | null
          pending_score: number | null
          recorded_by: string
          school_id: string
          score: number
          status: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          grade_item_id: string
          id?: string
          note?: string | null
          pending_reason?: string | null
          pending_requested_at?: string | null
          pending_requested_by?: string | null
          pending_score?: number | null
          recorded_by: string
          school_id: string
          score: number
          status?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          grade_item_id?: string
          id?: string
          note?: string | null
          pending_reason?: string | null
          pending_requested_at?: string | null
          pending_requested_by?: string | null
          pending_score?: number | null
          recorded_by?: string
          school_id?: string
          score?: number
          status?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_scores_school_id_enrollment_id_fkey"
            columns: ["school_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "grade_scores_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_scores_school_id_grade_item_id_fkey"
            columns: ["school_id", "grade_item_id"]
            isOneToOne: false
            referencedRelation: "grade_items"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      grade_sheet_rows: {
        Row: {
          absence_percentage: number
          continuous_average: number | null
          created_at: string
          enrollment_id: string
          exam_average: number | null
          grade_sheet_id: string
          id: string
          observation: string | null
          result: string
          school_id: string
          subject_breakdown: Json
          term_average: number | null
          updated_at: string
        }
        Insert: {
          absence_percentage?: number
          continuous_average?: number | null
          created_at?: string
          enrollment_id: string
          exam_average?: number | null
          grade_sheet_id: string
          id?: string
          observation?: string | null
          result?: string
          school_id: string
          subject_breakdown?: Json
          term_average?: number | null
          updated_at?: string
        }
        Update: {
          absence_percentage?: number
          continuous_average?: number | null
          created_at?: string
          enrollment_id?: string
          exam_average?: number | null
          grade_sheet_id?: string
          id?: string
          observation?: string | null
          result?: string
          school_id?: string
          subject_breakdown?: Json
          term_average?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_sheet_rows_school_id_enrollment_id_fkey"
            columns: ["school_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "grade_sheet_rows_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_sheet_rows_school_id_grade_sheet_id_fkey"
            columns: ["school_id", "grade_sheet_id"]
            isOneToOne: false
            referencedRelation: "grade_sheets"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      grade_sheets: {
        Row: {
          academic_year_id: string
          class_group_id: string
          closed_at: string | null
          created_at: string
          created_by: string
          homologated_at: string | null
          id: string
          kind: string
          published_at: string | null
          reopen_reason: string | null
          rule_set_id: string
          school_id: string
          status: string
          submitted_at: string | null
          term_id: string | null
          title: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          academic_year_id: string
          class_group_id: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          homologated_at?: string | null
          id?: string
          kind: string
          published_at?: string | null
          reopen_reason?: string | null
          rule_set_id: string
          school_id: string
          status?: string
          submitted_at?: string | null
          term_id?: string | null
          title: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          academic_year_id?: string
          class_group_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          homologated_at?: string | null
          id?: string
          kind?: string
          published_at?: string | null
          reopen_reason?: string | null
          rule_set_id?: string
          school_id?: string
          status?: string
          submitted_at?: string | null
          term_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_sheets_school_id_academic_year_id_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "grade_sheets_school_id_class_group_id_fkey"
            columns: ["school_id", "class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "grade_sheets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_sheets_school_id_term_id_fkey"
            columns: ["school_id", "term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      gradebooks: {
        Row: {
          academic_year_id: string
          class_group_id: string
          class_subject_id: string
          closed_at: string | null
          created_at: string
          created_by: string
          id: string
          opened_at: string | null
          rule_set_id: string
          school_id: string
          status: string
          submitted_at: string | null
          term_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          academic_year_id: string
          class_group_id: string
          class_subject_id: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          opened_at?: string | null
          rule_set_id: string
          school_id: string
          status?: string
          submitted_at?: string | null
          term_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          academic_year_id?: string
          class_group_id?: string
          class_subject_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          opened_at?: string | null
          rule_set_id?: string
          school_id?: string
          status?: string
          submitted_at?: string | null
          term_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "gradebooks_school_id_academic_year_id_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "gradebooks_school_id_class_group_id_fkey"
            columns: ["school_id", "class_group_id"]
            isOneToOne: false
            referencedRelation: "class_groups"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "gradebooks_school_id_class_subject_id_fkey"
            columns: ["school_id", "class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "gradebooks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_school_id_term_id_fkey"
            columns: ["school_id", "term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      grading_scales: {
        Row: {
          code: string
          created_at: string
          decimal_places: number
          id: string
          is_active: boolean
          maximum_value: number
          minimum_value: number
          name: string
          passing_value: number
          school_id: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          decimal_places?: number
          id?: string
          is_active?: boolean
          maximum_value: number
          minimum_value: number
          name: string
          passing_value: number
          school_id: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          decimal_places?: number
          id?: string
          is_active?: boolean
          maximum_value?: number
          minimum_value?: number
          name?: string
          passing_value?: number
          school_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "grading_scales_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_absence_events: {
        Row: {
          absence_date: string
          absence_type: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          deduction_multiplier: number
          deleted_at: string | null
          duration_minutes: number
          employment_id: string
          evidence_ref: string | null
          id: string
          reason: string | null
          school_id: string
          source_id: string | null
          source_type: string | null
          updated_at: string
          updated_by: string | null
          validated_at: string | null
          validated_by: string | null
          validation_status: string
          version: number
        }
        Insert: {
          absence_date: string
          absence_type: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deduction_multiplier?: number
          deleted_at?: string | null
          duration_minutes: number
          employment_id: string
          evidence_ref?: string | null
          id?: string
          reason?: string | null
          school_id: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
          updated_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
          version?: number
        }
        Update: {
          absence_date?: string
          absence_type?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deduction_multiplier?: number
          deleted_at?: string | null
          duration_minutes?: number
          employment_id?: string
          evidence_ref?: string | null
          id?: string
          reason?: string | null
          school_id?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
          updated_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_absence_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_absence_events_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "hr_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_absence_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance_assurance_evidence: {
        Row: {
          actor_user_id: string
          assurance_score: number
          captured_at: string
          decision: string
          device_integrity_provider: string | null
          device_integrity_valid: boolean | null
          distance_from_school_m: number | null
          id: string
          identity_valid: boolean
          inside_geofence: boolean | null
          latitude: number | null
          location_accuracy_m: number | null
          location_supplied: boolean
          longitude: number | null
          metadata: Json
          occurrence_id: string
          purpose: string
          qr_valid: boolean
          reasons: Json
          school_id: string
          time_valid: boolean | null
        }
        Insert: {
          actor_user_id: string
          assurance_score?: number
          captured_at?: string
          decision: string
          device_integrity_provider?: string | null
          device_integrity_valid?: boolean | null
          distance_from_school_m?: number | null
          id?: string
          identity_valid?: boolean
          inside_geofence?: boolean | null
          latitude?: number | null
          location_accuracy_m?: number | null
          location_supplied?: boolean
          longitude?: number | null
          metadata?: Json
          occurrence_id: string
          purpose: string
          qr_valid?: boolean
          reasons?: Json
          school_id: string
          time_valid?: boolean | null
        }
        Update: {
          actor_user_id?: string
          assurance_score?: number
          captured_at?: string
          decision?: string
          device_integrity_provider?: string | null
          device_integrity_valid?: boolean | null
          distance_from_school_m?: number | null
          id?: string
          identity_valid?: boolean
          inside_geofence?: boolean | null
          latitude?: number | null
          location_accuracy_m?: number | null
          location_supplied?: boolean
          longitude?: number | null
          metadata?: Json
          occurrence_id?: string
          purpose?: string
          qr_valid?: boolean
          reasons?: Json
          school_id?: string
          time_valid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_assurance_evidence_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "hr_teacher_lesson_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_attendance_assurance_evidence_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance_assurance_policies: {
        Row: {
          auto_approve_score: number
          center_latitude: number | null
          center_longitude: number | null
          checkin_early_minutes: number
          checkin_late_minutes: number
          checkout_early_minutes: number
          checkout_late_minutes: number
          created_at: string
          device_integrity_weight: number
          enabled: boolean
          geofence_radius_m: number
          identity_weight: number
          location_weight: number
          max_location_accuracy_m: number
          qr_weight: number
          require_location: boolean
          review_score: number
          school_id: string
          store_exact_location: boolean
          time_weight: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          auto_approve_score?: number
          center_latitude?: number | null
          center_longitude?: number | null
          checkin_early_minutes?: number
          checkin_late_minutes?: number
          checkout_early_minutes?: number
          checkout_late_minutes?: number
          created_at?: string
          device_integrity_weight?: number
          enabled?: boolean
          geofence_radius_m?: number
          identity_weight?: number
          location_weight?: number
          max_location_accuracy_m?: number
          qr_weight?: number
          require_location?: boolean
          review_score?: number
          school_id: string
          store_exact_location?: boolean
          time_weight?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          auto_approve_score?: number
          center_latitude?: number | null
          center_longitude?: number | null
          checkin_early_minutes?: number
          checkin_late_minutes?: number
          checkout_early_minutes?: number
          checkout_late_minutes?: number
          created_at?: string
          device_integrity_weight?: number
          enabled?: boolean
          geofence_radius_m?: number
          identity_weight?: number
          location_weight?: number
          max_location_accuracy_m?: number
          qr_weight?: number
          require_location?: boolean
          review_score?: number
          school_id?: string
          store_exact_location?: boolean
          time_weight?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_assurance_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_compensation_events: {
        Row: {
          amount_kz: number | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          employment_id: string
          event_date: string
          event_type: string
          id: string
          quantity: number
          school_id: string
          source_id: string | null
          source_type: string | null
          unit_rate_kz: number
          updated_at: string
          updated_by: string | null
          validated_at: string | null
          validated_by: string | null
          validation_status: string
          version: number
        }
        Insert: {
          amount_kz?: number | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          employment_id: string
          event_date: string
          event_type: string
          id?: string
          quantity?: number
          school_id: string
          source_id?: string | null
          source_type?: string | null
          unit_rate_kz?: number
          updated_at?: string
          updated_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
          version?: number
        }
        Update: {
          amount_kz?: number | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          employment_id?: string
          event_date?: string
          event_type?: string
          id?: string
          quantity?: number
          school_id?: string
          source_id?: string | null
          source_type?: string | null
          unit_rate_kz?: number
          updated_at?: string
          updated_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_compensation_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_compensation_events_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "hr_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_compensation_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_contract_remuneration_policies: {
        Row: {
          active: boolean
          allow_overtime_additions: boolean
          allow_validated_hour_additions: boolean
          allow_validated_lesson_additions: boolean
          contract_id: string
          created_at: string
          created_by: string | null
          deduct_justified_paid_absence: boolean
          deduct_justified_unpaid_absence: boolean
          deduct_unjustified_absence: boolean
          id: string
          legal_reference: string | null
          monthly_divisor_days: number | null
          notes: string | null
          policy_source: string
          remuneration_model: string
          school_id: string
          standard_workday_minutes: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          allow_overtime_additions?: boolean
          allow_validated_hour_additions?: boolean
          allow_validated_lesson_additions?: boolean
          contract_id: string
          created_at?: string
          created_by?: string | null
          deduct_justified_paid_absence?: boolean
          deduct_justified_unpaid_absence?: boolean
          deduct_unjustified_absence?: boolean
          id?: string
          legal_reference?: string | null
          monthly_divisor_days?: number | null
          notes?: string | null
          policy_source?: string
          remuneration_model: string
          school_id: string
          standard_workday_minutes?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          allow_overtime_additions?: boolean
          allow_validated_hour_additions?: boolean
          allow_validated_lesson_additions?: boolean
          contract_id?: string
          created_at?: string
          created_by?: string | null
          deduct_justified_paid_absence?: boolean
          deduct_justified_unpaid_absence?: boolean
          deduct_unjustified_absence?: boolean
          id?: string
          legal_reference?: string | null
          monthly_divisor_days?: number | null
          notes?: string | null
          policy_source?: string
          remuneration_model?: string
          school_id?: string
          standard_workday_minutes?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_contract_remuneration_policies_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contract_remuneration_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_contract_salary_amendments: {
        Row: {
          applied_by: string
          contract_id: string
          created_at: string
          effective_on: string
          id: string
          new_base_salary_kz: number
          previous_base_salary_kz: number
          request_id: string
          salary_scale_step_id: string | null
          school_id: string
        }
        Insert: {
          applied_by: string
          contract_id: string
          created_at?: string
          effective_on: string
          id?: string
          new_base_salary_kz: number
          previous_base_salary_kz: number
          request_id: string
          salary_scale_step_id?: string | null
          school_id: string
        }
        Update: {
          applied_by?: string
          contract_id?: string
          created_at?: string
          effective_on?: string
          id?: string
          new_base_salary_kz?: number
          previous_base_salary_kz?: number
          request_id?: string
          salary_scale_step_id?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_contract_salary_amendments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contract_salary_amendments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "hr_salary_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contract_salary_amendments_salary_scale_step_id_fkey"
            columns: ["salary_scale_step_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_scale_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contract_salary_amendments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_contracts: {
        Row: {
          base_salary_kz: number
          contract_number: string | null
          contract_type: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          employment_id: string
          ends_on: string | null
          hourly_rate_kz: number | null
          id: string
          lesson_hour_rate_kz: number | null
          metadata: Json
          payment_day: number | null
          salary_scale_snapshot_kz: number | null
          salary_scale_step_id: string | null
          salary_type: string
          school_id: string
          starts_on: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          base_salary_kz?: number
          contract_number?: string | null
          contract_type: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          employment_id: string
          ends_on?: string | null
          hourly_rate_kz?: number | null
          id?: string
          lesson_hour_rate_kz?: number | null
          metadata?: Json
          payment_day?: number | null
          salary_scale_snapshot_kz?: number | null
          salary_scale_step_id?: string | null
          salary_type: string
          school_id: string
          starts_on: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          base_salary_kz?: number
          contract_number?: string | null
          contract_type?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          employment_id?: string
          ends_on?: string | null
          hourly_rate_kz?: number | null
          id?: string
          lesson_hour_rate_kz?: number | null
          metadata?: Json
          payment_day?: number | null
          salary_scale_snapshot_kz?: number | null
          salary_scale_step_id?: string | null
          salary_type?: string
          school_id?: string
          starts_on?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_contracts_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "hr_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contracts_salary_scale_step_id_fkey"
            columns: ["salary_scale_step_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_scale_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contracts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_departments: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          parent_department_id: string | null
          school_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          parent_department_id?: string | null
          school_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_department_id?: string | null
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_departments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          employee_number: string | null
          employment_type: string
          hire_date: string
          id: string
          notes: string | null
          person_id: string
          position_id: string | null
          school_id: string
          status: string
          termination_date: string | null
          updated_at: string
          updated_by: string | null
          version: number
          weekly_hours: number | null
          work_location: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          employee_number?: string | null
          employment_type: string
          hire_date: string
          id?: string
          notes?: string | null
          person_id: string
          position_id?: string | null
          school_id: string
          status?: string
          termination_date?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekly_hours?: number | null
          work_location?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          employee_number?: string | null
          employment_type?: string
          hire_date?: string
          id?: string
          notes?: string | null
          person_id?: string
          position_id?: string | null
          school_id?: string
          status?: string
          termination_date?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekly_hours?: number | null
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "hr_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payment_destinations: {
        Row: {
          account_number: string | null
          active: boolean
          bank_name: string | null
          beneficiary_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          destination_reference: string | null
          employment_id: string
          iban: string | null
          id: string
          is_primary: boolean
          method: string
          school_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          account_number?: string | null
          active?: boolean
          bank_name?: string | null
          beneficiary_name: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_reference?: string | null
          employment_id: string
          iban?: string | null
          id?: string
          is_primary?: boolean
          method?: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          account_number?: string | null
          active?: boolean
          bank_name?: string | null
          beneficiary_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_reference?: string | null
          employment_id?: string
          iban?: string | null
          id?: string
          is_primary?: boolean
          method?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payment_destinations_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "hr_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payment_destinations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payment_settings: {
        Row: {
          allow_manual_confirmation: boolean
          created_at: string
          default_method: string
          require_dual_control: boolean
          school_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          allow_manual_confirmation?: boolean
          created_at?: string
          default_method?: string
          require_dual_control?: boolean
          school_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          allow_manual_confirmation?: boolean
          created_at?: string
          default_method?: string
          require_dual_control?: boolean
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payment_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_item_components: {
        Row: {
          amount_kz: number
          code: string
          component_type: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          name: string
          payroll_item_id: string
          school_id: string
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          amount_kz: number
          code: string
          component_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          name: string
          payroll_item_id: string
          school_id: string
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          amount_kz?: number
          code?: string
          component_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          name?: string
          payroll_item_id?: string
          school_id?: string
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_item_components_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_item_components_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_items: {
        Row: {
          allowances_kz: number
          base_amount_kz: number
          bonuses_kz: number
          calculation_details: Json
          contract_id: string | null
          created_at: string
          created_by: string | null
          deductions_kz: number
          employment_id: string
          gross_amount_kz: number
          hourly_amount_kz: number
          id: string
          net_amount_kz: number
          overtime_kz: number
          payroll_run_id: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          allowances_kz?: number
          base_amount_kz?: number
          bonuses_kz?: number
          calculation_details?: Json
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deductions_kz?: number
          employment_id: string
          gross_amount_kz?: number
          hourly_amount_kz?: number
          id?: string
          net_amount_kz?: number
          overtime_kz?: number
          payroll_run_id: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          allowances_kz?: number
          base_amount_kz?: number
          bonuses_kz?: number
          calculation_details?: Json
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deductions_kz?: number
          employment_id?: string
          gross_amount_kz?: number
          hourly_amount_kz?: number
          id?: string
          net_amount_kz?: number
          overtime_kz?: number
          payroll_run_id?: string
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_items_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "hr_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_payment_batches: {
        Row: {
          authorized_at: string | null
          authorized_by: string | null
          batch_number: string
          blocked_count: number
          created_at: string
          created_by: string | null
          execution_reference: string | null
          id: string
          method: string
          notes: string | null
          payable_count: number
          payroll_run_id: string
          prepared_at: string
          prepared_by: string
          school_id: string
          status: string
          total_amount_kz: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          authorized_at?: string | null
          authorized_by?: string | null
          batch_number: string
          blocked_count?: number
          created_at?: string
          created_by?: string | null
          execution_reference?: string | null
          id?: string
          method?: string
          notes?: string | null
          payable_count?: number
          payroll_run_id: string
          prepared_at?: string
          prepared_by: string
          school_id: string
          status?: string
          total_amount_kz?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          authorized_at?: string | null
          authorized_by?: string | null
          batch_number?: string
          blocked_count?: number
          created_at?: string
          created_by?: string | null
          execution_reference?: string | null
          id?: string
          method?: string
          notes?: string | null
          payable_count?: number
          payroll_run_id?: string
          prepared_at?: string
          prepared_by?: string
          school_id?: string
          status?: string
          total_amount_kz?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_payment_batches_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_payment_items: {
        Row: {
          amount_kz: number
          batch_id: string
          beneficiary_name: string
          block_reason: string | null
          cash_expense_id: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          destination_id: string | null
          destination_label: string | null
          employment_id: string
          failure_reason: string | null
          id: string
          metadata: Json
          paid_at: string | null
          payroll_item_id: string
          provider_reference: string | null
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          amount_kz: number
          batch_id: string
          beneficiary_name: string
          block_reason?: string | null
          cash_expense_id?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          destination_label?: string | null
          employment_id: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          payroll_item_id: string
          provider_reference?: string | null
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          amount_kz?: number
          batch_id?: string
          beneficiary_name?: string
          block_reason?: string | null
          cash_expense_id?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          destination_label?: string | null
          employment_id?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          payroll_item_id?: string
          provider_reference?: string | null
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_payment_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_items_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "hr_payment_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_items_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "hr_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_items_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          competence_month: number
          competence_year: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          school_id: string
          status: string
          total_deductions_kz: number
          total_gross_kz: number
          total_net_kz: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          competence_month: number
          competence_year: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          school_id: string
          status?: string
          total_deductions_kz?: number
          total_gross_kz?: number
          total_net_kz?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          competence_month?: number
          competence_year?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          school_id?: string
          status?: string
          total_deductions_kz?: number
          total_gross_kz?: number
          total_net_kz?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_runs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_positions: {
        Row: {
          active: boolean
          category: string
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          description: string | null
          id: string
          name: string
          school_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          category?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          name: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          category?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_positions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_change_requests: {
        Row: {
          applied_at: string | null
          contract_id: string
          created_at: string
          effective_on: string
          id: string
          proposed_base_salary_kz: number
          reason: string
          requested_by: string | null
          requested_step_id: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          contract_id: string
          created_at?: string
          effective_on: string
          id?: string
          proposed_base_salary_kz: number
          reason: string
          requested_by?: string | null
          requested_step_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          contract_id?: string
          created_at?: string
          effective_on?: string
          id?: string
          proposed_base_salary_kz?: number
          reason?: string
          requested_by?: string | null
          requested_step_id?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_salary_change_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_salary_change_requests_requested_step_id_fkey"
            columns: ["requested_step_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_scale_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_salary_change_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_scale_steps: {
        Row: {
          category_code: string
          category_name: string
          created_at: string
          grade: string
          id: string
          monthly_base_kz: number
          version_id: string
        }
        Insert: {
          category_code: string
          category_name: string
          created_at?: string
          grade: string
          id?: string
          monthly_base_kz: number
          version_id: string
        }
        Update: {
          category_code?: string
          category_name?: string
          created_at?: string
          grade?: string
          id?: string
          monthly_base_kz?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_salary_scale_steps_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_scale_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_scale_versions: {
        Row: {
          approved_at: string | null
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          scale_id: string
          status: string
          version_label: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          effective_from: string
          effective_until?: string | null
          id?: string
          scale_id: string
          status?: string
          version_label: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          scale_id?: string
          status?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_salary_scale_versions_scale_id_fkey"
            columns: ["scale_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_scales"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_scales: {
        Row: {
          code: string
          created_at: string
          id: string
          jurisdiction: string
          name: string
          sector: string
          source_reference: string | null
          source_title: string | null
          source_url: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          jurisdiction?: string
          name: string
          sector: string
          source_reference?: string | null
          source_title?: string | null
          source_url?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          jurisdiction?: string
          name?: string
          sector?: string
          source_reference?: string | null
          source_title?: string | null
          source_url?: string | null
        }
        Relationships: []
      }
      hr_teacher_attendance_policies: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          early_leave_grace_minutes: number
          id: string
          late_grace_minutes: number
          minimum_attendance_percent: number
          name: string
          outside_grace_mode: string
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
          early_leave_grace_minutes?: number
          id?: string
          late_grace_minutes?: number
          minimum_attendance_percent?: number
          name?: string
          outside_grace_mode?: string
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
          early_leave_grace_minutes?: number
          id?: string
          late_grace_minutes?: number
          minimum_attendance_percent?: number
          name?: string
          outside_grace_mode?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_teacher_attendance_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_teacher_employment_links: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          employment_id: string
          ends_on: string | null
          id: string
          school_id: string
          starts_on: string
          status: string
          teacher_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employment_id: string
          ends_on?: string | null
          id?: string
          school_id: string
          starts_on?: string
          status?: string
          teacher_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          employment_id?: string
          ends_on?: string | null
          id?: string
          school_id?: string
          starts_on?: string
          status?: string
          teacher_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_teacher_employment_links_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "hr_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_employment_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_employment_links_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_teacher_lesson_occurrences: {
        Row: {
          actual_ended_at: string | null
          actual_started_at: string | null
          adjustment_reason: string | null
          attendance_exception_status: string
          attendance_percent: number | null
          class_subject_id: string
          compensation_event_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          early_leave_minutes: number
          employment_id: string
          evidence_method: string | null
          evidence_ref: string | null
          id: string
          late_minutes: number
          lesson_date: string
          notes: string | null
          occurrence_kind: string
          original_teacher_id: string | null
          payable_quantity: number | null
          quantity: number
          review_decision: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheduled_ends_at: string
          scheduled_starts_at: string
          school_id: string
          status: string
          teacher_id: string
          timetable_slot_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          actual_ended_at?: string | null
          actual_started_at?: string | null
          adjustment_reason?: string | null
          attendance_exception_status?: string
          attendance_percent?: number | null
          class_subject_id: string
          compensation_event_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          early_leave_minutes?: number
          employment_id: string
          evidence_method?: string | null
          evidence_ref?: string | null
          id?: string
          late_minutes?: number
          lesson_date: string
          notes?: string | null
          occurrence_kind?: string
          original_teacher_id?: string | null
          payable_quantity?: number | null
          quantity?: number
          review_decision?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_ends_at: string
          scheduled_starts_at: string
          school_id: string
          status?: string
          teacher_id: string
          timetable_slot_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          actual_ended_at?: string | null
          actual_started_at?: string | null
          adjustment_reason?: string | null
          attendance_exception_status?: string
          attendance_percent?: number | null
          class_subject_id?: string
          compensation_event_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          early_leave_minutes?: number
          employment_id?: string
          evidence_method?: string | null
          evidence_ref?: string | null
          id?: string
          late_minutes?: number
          lesson_date?: string
          notes?: string | null
          occurrence_kind?: string
          original_teacher_id?: string | null
          payable_quantity?: number | null
          quantity?: number
          review_decision?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_ends_at?: string
          scheduled_starts_at?: string
          school_id?: string
          status?: string
          teacher_id?: string
          timetable_slot_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_teacher_lesson_occurrences_class_subject_id_fkey"
            columns: ["class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_lesson_occurrences_compensation_event_id_fkey"
            columns: ["compensation_event_id"]
            isOneToOne: false
            referencedRelation: "hr_compensation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_lesson_occurrences_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_lesson_occurrences_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "hr_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_lesson_occurrences_original_teacher_id_fkey"
            columns: ["original_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_lesson_occurrences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_lesson_occurrences_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_lesson_occurrences_timetable_slot_id_fkey"
            columns: ["timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_teacher_qr_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          issued_at: string
          metadata: Json
          occurrence_id: string
          purpose: string
          revoked_at: string | null
          revoked_by: string | null
          school_id: string
          status: string
          token_hash: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          issued_at?: string
          metadata?: Json
          occurrence_id: string
          purpose: string
          revoked_at?: string | null
          revoked_by?: string | null
          school_id: string
          status?: string
          token_hash: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          issued_at?: string
          metadata?: Json
          occurrence_id?: string
          purpose?: string
          revoked_at?: string | null
          revoked_by?: string | null
          school_id?: string
          status?: string
          token_hash?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_teacher_qr_sessions_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "hr_teacher_lesson_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_teacher_qr_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          reversible: boolean
          row_id: string | null
          sequence_no: number | null
          source_hash: string | null
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
          reversible?: boolean
          row_id?: string | null
          sequence_no?: number | null
          source_hash?: string | null
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
          reversible?: boolean
          row_id?: string | null
          sequence_no?: number | null
          source_hash?: string | null
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
          dependency_plan: Json
          dry_run: boolean
          duplicate_rows: number
          error_summary: Json
          exchange_mode: string
          file_name: string
          file_path: string | null
          id: string
          idempotency_key: string | null
          ignored_rows: number
          inserted_rows: number
          invalid_rows: number
          job_metadata: Json | null
          manifest: Json
          module: string
          schema_version: string
          school_id: string
          source_format: string
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
          dependency_plan?: Json
          dry_run?: boolean
          duplicate_rows?: number
          error_summary?: Json
          exchange_mode?: string
          file_name: string
          file_path?: string | null
          id?: string
          idempotency_key?: string | null
          ignored_rows?: number
          inserted_rows?: number
          invalid_rows?: number
          job_metadata?: Json | null
          manifest?: Json
          module: string
          schema_version?: string
          school_id: string
          source_format?: string
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
          dependency_plan?: Json
          dry_run?: boolean
          duplicate_rows?: number
          error_summary?: Json
          exchange_mode?: string
          file_name?: string
          file_path?: string | null
          id?: string
          idempotency_key?: string | null
          ignored_rows?: number
          inserted_rows?: number
          invalid_rows?: number
          job_metadata?: Json | null
          manifest?: Json
          module?: string
          schema_version?: string
          school_id?: string
          source_format?: string
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
          natural_key: Json
          natural_key_hash: string | null
          normalized_data: Json
          raw_data: Json
          resolution: Json
          row_number: number
          sheet_name: string
          source_hash: string | null
          status: string
          target_record_id: string | null
          validation_stage: string
          warnings: Json | null
        }
        Insert: {
          created_at?: string
          duplicate_of?: string | null
          errors?: Json | null
          id?: string
          import_job_id: string
          natural_key?: Json
          natural_key_hash?: string | null
          normalized_data?: Json
          raw_data?: Json
          resolution?: Json
          row_number: number
          sheet_name?: string
          source_hash?: string | null
          status?: string
          target_record_id?: string | null
          validation_stage?: string
          warnings?: Json | null
        }
        Update: {
          created_at?: string
          duplicate_of?: string | null
          errors?: Json | null
          id?: string
          import_job_id?: string
          natural_key?: Json
          natural_key_hash?: string | null
          normalized_data?: Json
          raw_data?: Json
          resolution?: Json
          row_number?: number
          sheet_name?: string
          source_hash?: string | null
          status?: string
          target_record_id?: string | null
          validation_stage?: string
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
      import_table_specs: {
        Row: {
          active: boolean
          created_at: string
          dependency_rank: number | null
          derived_from: Json
          direct_import_policy: string
          export_policy: string
          fk_dependencies: Json
          id: string
          module_code: string | null
          natural_key_columns: Json
          notes: string | null
          sensitivity: string
          table_name: string
          table_schema: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dependency_rank?: number | null
          derived_from?: Json
          direct_import_policy?: string
          export_policy?: string
          fk_dependencies?: Json
          id?: string
          module_code?: string | null
          natural_key_columns?: Json
          notes?: string | null
          sensitivity?: string
          table_name: string
          table_schema?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dependency_rank?: number | null
          derived_from?: Json
          direct_import_policy?: string
          export_policy?: string
          fk_dependencies?: Json
          id?: string
          module_code?: string | null
          natural_key_columns?: Json
          notes?: string | null
          sensitivity?: string
          table_name?: string
          table_schema?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_templates: {
        Row: {
          checksum: string | null
          created_at: string
          dependencies: Json
          header_signature: Json
          id: string
          is_system: boolean
          mappings: Json
          mode: string
          module: string
          name: string
          school_id: string
          target_tables: Json
          updated_at: string
          version: number
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          dependencies?: Json
          header_signature?: Json
          id?: string
          is_system?: boolean
          mappings?: Json
          mode?: string
          module: string
          name: string
          school_id: string
          target_tables?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          checksum?: string | null
          created_at?: string
          dependencies?: Json
          header_signature?: Json
          id?: string
          is_system?: boolean
          mappings?: Json
          mode?: string
          module?: string
          name?: string
          school_id?: string
          target_tables?: Json
          updated_at?: string
          version?: number
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
      issued_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          body_snapshot: string
          document_number: string
          document_type: string
          id: string
          issued_at: string
          issued_by: string
          request_id: string | null
          requires_signature: boolean
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          school_id: string
          signature_note: string | null
          signature_status: string
          signed_at: string | null
          signed_by: string | null
          status: string
          student_id: string
          template_id: string
          template_version: number
          title: string
          validation_code: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          body_snapshot: string
          document_number: string
          document_type: string
          id?: string
          issued_at?: string
          issued_by: string
          request_id?: string | null
          requires_signature?: boolean
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          school_id: string
          signature_note?: string | null
          signature_status?: string
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          student_id: string
          template_id: string
          template_version: number
          title: string
          validation_code: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          body_snapshot?: string
          document_number?: string
          document_type?: string
          id?: string
          issued_at?: string
          issued_by?: string
          request_id?: string | null
          requires_signature?: boolean
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          school_id?: string
          signature_note?: string | null
          signature_status?: string
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          student_id?: string
          template_id?: string
          template_version?: number
          title?: string
          validation_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "issued_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_documents_school_id_request_id_fkey"
            columns: ["school_id", "request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "issued_documents_school_id_student_id_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "issued_documents_school_id_template_id_fkey"
            columns: ["school_id", "template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      mailboxes: {
        Row: {
          address: string
          created_at: string
          external_id: string | null
          id: string
          plan_id: string | null
          provider: string
          school_id: string
          status: string
          storage_limit_gb: number
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          external_id?: string | null
          id?: string
          plan_id?: string | null
          provider: string
          school_id: string
          status?: string
          storage_limit_gb?: number
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          external_id?: string | null
          id?: string
          plan_id?: string | null
          provider?: string
          school_id?: string
          status?: string
          storage_limit_gb?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailboxes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailboxes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      member_roles: {
        Row: {
          created_at: string
          membership_id: string
          role_id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          membership_id: string
          role_id: string
          school_id: string
        }
        Update: {
          created_at?: string
          membership_id?: string
          role_id?: string
          school_id?: string
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
          {
            foreignKeyName: "member_roles_school_id_membership_id_fkey"
            columns: ["school_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "school_memberships"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "member_roles_school_id_role_id_fkey"
            columns: ["school_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      module_catalog: {
        Row: {
          code: string
          created_at: string
          is_essential: boolean
          manifest: Json
          name: string
          updated_at: string
          version: string
        }
        Insert: {
          code: string
          created_at?: string
          is_essential?: boolean
          manifest: Json
          name: string
          updated_at?: string
          version: string
        }
        Update: {
          code?: string
          created_at?: string
          is_essential?: boolean
          manifest?: Json
          name?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          announcement_id: string | null
          body: string
          channel: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          read_at: string | null
          school_id: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          announcement_id?: string | null
          body: string
          channel?: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          read_at?: string | null
          school_id: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          announcement_id?: string | null
          body?: string
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          read_at?: string | null
          school_id?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_announcement_fk"
            columns: ["school_id", "announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          address: string | null
          commune: string | null
          created_at: string
          created_by: string
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          municipality: string | null
          national_id: string | null
          phone: string | null
          photo_path: string | null
          photo_url: string | null
          preferred_name: string | null
          province: string | null
          school_id: string
          sex: string | null
          status: string
          updated_at: string
          updated_by: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          commune?: string | null
          created_at?: string
          created_by: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          municipality?: string | null
          national_id?: string | null
          phone?: string | null
          photo_path?: string | null
          photo_url?: string | null
          preferred_name?: string | null
          province?: string | null
          school_id: string
          sex?: string | null
          status?: string
          updated_at?: string
          updated_by: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          commune?: string | null
          created_at?: string
          created_by?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          municipality?: string | null
          national_id?: string | null
          phone?: string | null
          photo_path?: string | null
          photo_url?: string | null
          preferred_name?: string | null
          province?: string | null
          school_id?: string
          sex?: string | null
          status?: string
          updated_at?: string
          updated_by?: string
          user_id?: string | null
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
          description: string
          id: string
        }
        Insert: {
          code: string
          description: string
          id?: string
        }
        Update: {
          code?: string
          description?: string
          id?: string
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
          file_id: string | null
          file_name: string | null
          id: string
          issued_at: string | null
          person_id: string
          school_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_number: string
          document_type: string
          expires_at?: string | null
          file_id?: string | null
          file_name?: string | null
          id?: string
          issued_at?: string | null
          person_id: string
          school_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_number?: string
          document_type?: string
          expires_at?: string | null
          file_id?: string | null
          file_name?: string | null
          id?: string
          issued_at?: string | null
          person_id?: string
          school_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_documents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
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
        }
        Relationships: [
          {
            foreignKeyName: "person_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_staff: number
          max_storage_gb: number
          max_students: number
          name: string
          price_aoa_monthly: number
          price_aoa_yearly: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_staff?: number
          max_storage_gb?: number
          max_students?: number
          name: string
          price_aoa_monthly?: number
          price_aoa_yearly?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_staff?: number
          max_storage_gb?: number
          max_students?: number
          name?: string
          price_aoa_monthly?: number
          price_aoa_yearly?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          cargo: string | null
          created_at: string
          display_name: string
          first_name: string | null
          full_name: string | null
          id: string
          last_active_at: string | null
          last_name: string | null
          locale: string
          national_id: string | null
          onboarding_status: string | null
          phone: string | null
          preferred_name: string | null
          school_id: string | null
          status: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          display_name: string
          first_name?: string | null
          full_name?: string | null
          id: string
          last_active_at?: string | null
          last_name?: string | null
          locale?: string
          national_id?: string | null
          onboarding_status?: string | null
          phone?: string | null
          preferred_name?: string | null
          school_id?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          display_name?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          last_name?: string | null
          locale?: string
          national_id?: string | null
          onboarding_status?: string | null
          phone?: string | null
          preferred_name?: string | null
          school_id?: string | null
          status?: string | null
          timezone?: string | null
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
          created_by: string | null
          credits: number
          deleted_at: string | null
          id: string
          program_id: string
          school_id: string
          semester: number
          status: string
          subject_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credits?: number
          deleted_at?: string | null
          id?: string
          program_id: string
          school_id: string
          semester: number
          status?: string
          subject_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credits?: number
          deleted_at?: string | null
          id?: string
          program_id?: string
          school_id?: string
          semester?: number
          status?: string
          subject_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
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
            foreignKeyName: "program_subjects_subject_fkey"
            columns: ["school_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      programs: {
        Row: {
          academic_level_id: string
          code: string
          created_at: string
          grading_profile: Json | null
          id: string
          is_active: boolean
          kind: string
          name: string
          school_id: string
        }
        Insert: {
          academic_level_id: string
          code: string
          created_at?: string
          grading_profile?: Json | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          school_id: string
        }
        Update: {
          academic_level_id?: string
          code?: string
          created_at?: string
          grading_profile?: Json | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_school_id_academic_level_id_fkey"
            columns: ["school_id", "academic_level_id"]
            isOneToOne: false
            referencedRelation: "academic_levels"
            referencedColumns: ["school_id", "id"]
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
      report_cards: {
        Row: {
          academic_year_id: string
          averages: Json
          created_at: string
          created_by: string
          enrollment_id: string
          grade_sheet_id: string
          id: string
          issued_at: string | null
          school_id: string
          status: string
          term_id: string | null
        }
        Insert: {
          academic_year_id: string
          averages?: Json
          created_at?: string
          created_by: string
          enrollment_id: string
          grade_sheet_id: string
          id?: string
          issued_at?: string | null
          school_id: string
          status?: string
          term_id?: string | null
        }
        Update: {
          academic_year_id?: string
          averages?: Json
          created_at?: string
          created_by?: string
          enrollment_id?: string
          grade_sheet_id?: string
          id?: string
          issued_at?: string | null
          school_id?: string
          status?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_school_id_academic_year_id_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "report_cards_school_id_enrollment_id_fkey"
            columns: ["school_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_school_id_grade_sheet_id_fkey"
            columns: ["school_id", "grade_sheet_id"]
            isOneToOne: false
            referencedRelation: "grade_sheets"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "report_cards_school_id_term_id_fkey"
            columns: ["school_id", "term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      reserved_subdomains: {
        Row: {
          created_at: string
          reason: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          reason?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          reason?: string | null
          slug?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
          school_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
          school_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
          school_id?: string
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
          {
            foreignKeyName: "role_permissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_school_id_role_id_fkey"
            columns: ["school_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          id: string
          is_system: boolean
          name: string
          school_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          school_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          school_id?: string
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
          accessibility: boolean
          block: string | null
          building: string | null
          campus_id: string | null
          capacity: number | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          floor: string | null
          id: string
          name: string
          notes: string | null
          resources: Json
          room_type: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          accessibility?: boolean
          block?: string | null
          building?: string | null
          campus_id?: string | null
          capacity?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          floor?: string | null
          id?: string
          name: string
          notes?: string | null
          resources?: Json
          room_type?: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          accessibility?: boolean
          block?: string | null
          building?: string | null
          campus_id?: string | null
          capacity?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          floor?: string | null
          id?: string
          name?: string
          notes?: string | null
          resources?: Json
          room_type?: string
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
      saas_audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      school_access_requests: {
        Row: {
          created_at: string
          enrollment_application_id: string | null
          full_name: string
          id: string
          institutional_id: string | null
          national_id: string | null
          person_id: string | null
          requested_role: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enrollment_application_id?: string | null
          full_name: string
          id?: string
          institutional_id?: string | null
          national_id?: string | null
          person_id?: string | null
          requested_role: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enrollment_application_id?: string | null
          full_name?: string
          id?: string
          institutional_id?: string | null
          national_id?: string | null
          person_id?: string | null
          requested_role?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_access_requests_enrollment_application_id_fkey"
            columns: ["enrollment_application_id"]
            isOneToOne: true
            referencedRelation: "enrollment_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_access_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_access_requests_school_id_fkey"
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
          audience?: string
          body: string
          channel?: string
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
      school_branding: {
        Row: {
          created_at: string
          favicon_url: string | null
          id: string
          login_background: string | null
          logo_url: string | null
          portal_title: string | null
          primary_color: string | null
          school_id: string
          school_name: string | null
          secondary_color: string | null
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          favicon_url?: string | null
          id?: string
          login_background?: string | null
          logo_url?: string | null
          portal_title?: string | null
          primary_color?: string | null
          school_id: string
          school_name?: string | null
          secondary_color?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          favicon_url?: string | null
          id?: string
          login_background?: string | null
          logo_url?: string | null
          portal_title?: string | null
          primary_color?: string | null
          school_id?: string
          school_name?: string | null
          secondary_color?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_branding_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_email_routes: {
        Row: {
          cloudflare_route_id: string | null
          created_at: string
          destination_address: string
          id: string
          provider: string
          school_id: string
          source_address: string
          status: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          cloudflare_route_id?: string | null
          created_at?: string
          destination_address: string
          id?: string
          provider?: string
          school_id: string
          source_address: string
          status?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          cloudflare_route_id?: string | null
          created_at?: string
          destination_address?: string
          id?: string
          provider?: string
          school_id?: string
          source_address?: string
          status?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "school_email_routes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_integration_secrets: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          provider: string
          school_id: string
          secret_key: string
          secret_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          provider: string
          school_id: string
          secret_key: string
          secret_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          school_id?: string
          secret_key?: string
          secret_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_integration_secrets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_integrations: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          provider: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          provider: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          provider?: string
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_integrations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
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
      school_modules: {
        Row: {
          id: string
          installed_at: string
          installed_by: string
          installed_version: string
          module_code: string
          school_id: string
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          id?: string
          installed_at?: string
          installed_by: string
          installed_version: string
          module_code: string
          school_id: string
          settings?: Json
          status: string
          updated_at?: string
        }
        Update: {
          id?: string
          installed_at?: string
          installed_by?: string
          installed_version?: string
          module_code?: string
          school_id?: string
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_modules_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "module_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "school_modules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          changed_by: string
          created_at: string
          domain: string
          id: string
          school_id: string
          value: Json
          version: number
        }
        Insert: {
          changed_by: string
          created_at?: string
          domain: string
          id?: string
          school_id: string
          value: Json
          version: number
        }
        Update: {
          changed_by?: string
          created_at?: string
          domain?: string
          id?: string
          school_id?: string
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
      school_shift_slots: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string
          id: string
          is_break: boolean
          name: string
          school_id: string
          shift_id: string
          slot_number: number
          starts_at: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at: string
          id?: string
          is_break?: boolean
          name: string
          school_id: string
          shift_id: string
          slot_number: number
          starts_at: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string
          id?: string
          is_break?: boolean
          name?: string
          school_id?: string
          shift_id?: string
          slot_number?: number
          starts_at?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_shift_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_shift_slots_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "school_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      school_shifts: {
        Row: {
          active_days: number[]
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          default_break_duration: number
          default_lesson_duration: number
          deleted_at: string | null
          ends_at: string
          id: string
          name: string
          school_id: string
          starts_at: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active_days?: number[]
          code: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          default_break_duration?: number
          default_lesson_duration?: number
          deleted_at?: string | null
          ends_at: string
          id?: string
          name: string
          school_id: string
          starts_at: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active_days?: number[]
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          default_break_duration?: number
          default_lesson_duration?: number
          deleted_at?: string | null
          ends_at?: string
          id?: string
          name?: string
          school_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_shifts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_slug_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_slug: string
          old_slug: string
          redirect_until: string | null
          tenant_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_slug: string
          old_slug: string
          redirect_until?: string | null
          tenant_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_slug?: string
          old_slug?: string
          redirect_until?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_slug_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          commercial_name: string | null
          created_at: string
          currency_code: string
          director_name: string | null
          email: string | null
          evaluation_periods: number
          id: string
          logo_path: string | null
          logo_url: string | null
          municipality: string | null
          name: string
          nif: string | null
          official_authorization_reference: string | null
          passing_grade: number
          phone: string | null
          preferences: Json
          province: string | null
          public_code: string
          status: string
          tenant_id: string | null
          theme: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          commercial_name?: string | null
          created_at?: string
          currency_code?: string
          director_name?: string | null
          email?: string | null
          evaluation_periods?: number
          id?: string
          logo_path?: string | null
          logo_url?: string | null
          municipality?: string | null
          name: string
          nif?: string | null
          official_authorization_reference?: string | null
          passing_grade?: number
          phone?: string | null
          preferences?: Json
          province?: string | null
          public_code: string
          status?: string
          tenant_id?: string | null
          theme?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          commercial_name?: string | null
          created_at?: string
          currency_code?: string
          director_name?: string | null
          email?: string | null
          evaluation_periods?: number
          id?: string
          logo_path?: string | null
          logo_url?: string | null
          municipality?: string | null
          name?: string
          nif?: string | null
          official_authorization_reference?: string | null
          passing_grade?: number
          phone?: string | null
          preferences?: Json
          province?: string | null
          public_code?: string
          status?: string
          tenant_id?: string | null
          theme?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_access_cards: {
        Row: {
          barcode: string
          card_number: string
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string
          person_id: string
          qr_secret: string
          rfid_tag: string | null
          school_id: string
          status: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          barcode: string
          card_number: string
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          person_id: string
          qr_secret?: string
          rfid_tag?: string | null
          school_id: string
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string
          card_number?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          person_id?: string
          qr_secret?: string
          rfid_tag?: string | null
          school_id?: string
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_access_cards_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_access_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_access_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_access_logs: {
        Row: {
          card_id: string | null
          created_at: string
          denial_reason: string | null
          device_id: string | null
          device_name: string | null
          direction: string
          id: string
          person_id: string | null
          school_id: string
          status: string
          student_id: string | null
        }
        Insert: {
          card_id?: string | null
          created_at?: string
          denial_reason?: string | null
          device_id?: string | null
          device_name?: string | null
          direction: string
          id?: string
          person_id?: string | null
          school_id: string
          status: string
          student_id?: string | null
        }
        Update: {
          card_id?: string | null
          created_at?: string
          denial_reason?: string | null
          device_id?: string | null
          device_name?: string | null
          direction?: string
          id?: string
          person_id?: string | null
          school_id?: string
          status?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siga_access_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "siga_access_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_access_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "siga_turnstile_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_access_logs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_access_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_access_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
          lesson_plan_component_id: string | null
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
          lesson_plan_component_id?: string | null
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
          lesson_plan_component_id?: string | null
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
            foreignKeyName: "siga_assessment_items_lesson_plan_component_id_fkey"
            columns: ["lesson_plan_component_id"]
            isOneToOne: false
            referencedRelation: "siga_lesson_plan_components"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "siga_attendance_justifications_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "siga_files"
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
          amount: number
          category: string
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
      siga_direct_messages: {
        Row: {
          attachment_file_id: string | null
          attachment_file_name: string | null
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          recipient_id: string
          school_id: string
          sender_id: string
        }
        Insert: {
          attachment_file_id?: string | null
          attachment_file_name?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_id: string
          school_id: string
          sender_id: string
        }
        Update: {
          attachment_file_id?: string | null
          attachment_file_name?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          recipient_id?: string
          school_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_direct_messages_attachment_file_id_fkey"
            columns: ["attachment_file_id"]
            isOneToOne: false
            referencedRelation: "siga_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_direct_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_file_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          detail: string | null
          file_id: string
          id: string
          school_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          detail?: string | null
          file_id: string
          id?: string
          school_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          detail?: string | null
          file_id?: string
          id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_file_events_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "siga_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_file_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_files: {
        Row: {
          area: string
          category: string | null
          class_group_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_date: string | null
          id: string
          is_folder: boolean
          is_system: boolean
          last_action: string | null
          last_action_at: string | null
          last_action_by: string | null
          mime: string
          name: string
          owner_user_id: string
          parent_id: string | null
          reference_code: string | null
          related_person_id: string | null
          related_user_id: string | null
          school_id: string
          size_bytes: number
          storage_backend: string
          storage_path: string
          title: string | null
          updated_at: string | null
          updated_by: string | null
          visibility: string
        }
        Insert: {
          area: string
          category?: string | null
          class_group_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_date?: string | null
          id?: string
          is_folder?: boolean
          is_system?: boolean
          last_action?: string | null
          last_action_at?: string | null
          last_action_by?: string | null
          mime: string
          name: string
          owner_user_id: string
          parent_id?: string | null
          reference_code?: string | null
          related_person_id?: string | null
          related_user_id?: string | null
          school_id: string
          size_bytes: number
          storage_backend?: string
          storage_path: string
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
          visibility: string
        }
        Update: {
          area?: string
          category?: string | null
          class_group_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_date?: string | null
          id?: string
          is_folder?: boolean
          is_system?: boolean
          last_action?: string | null
          last_action_at?: string | null
          last_action_by?: string | null
          mime?: string
          name?: string
          owner_user_id?: string
          parent_id?: string | null
          reference_code?: string | null
          related_person_id?: string | null
          related_user_id?: string | null
          school_id?: string
          size_bytes?: number
          storage_backend?: string
          storage_path?: string
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_files_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "siga_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_files_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_files_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_lesson_meetings: {
        Row: {
          attendance_session_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          external_meeting_id: string
          id: string
          join_url: string
          provider: string
          school_id: string
          starts_at: string | null
          status: string
          topic: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attendance_session_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          external_meeting_id: string
          id?: string
          join_url: string
          provider?: string
          school_id: string
          starts_at?: string | null
          status?: string
          topic?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attendance_session_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          external_meeting_id?: string
          id?: string
          join_url?: string
          provider?: string
          school_id?: string
          starts_at?: string | null
          status?: string
          topic?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siga_lesson_meetings_attendance_session_id_fkey"
            columns: ["attendance_session_id"]
            isOneToOne: false
            referencedRelation: "siga_attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_lesson_meetings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_lesson_plan_components: {
        Row: {
          created_at: string
          id: string
          kind: string
          lesson_plan_id: string
          name: string
          planned_count: number
          school_id: string
          sequence: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          lesson_plan_id: string
          name: string
          planned_count?: number
          school_id: string
          sequence?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          lesson_plan_id?: string
          name?: string
          planned_count?: number
          school_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "siga_lesson_plan_components_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "siga_lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_lesson_plan_components_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_lesson_plans: {
        Row: {
          class_group_id: string
          content: string | null
          created_at: string
          created_by: string | null
          file_id: string | null
          file_name: string | null
          id: string
          school_id: string
          status: string
          subject_id: string
          term: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          class_group_id: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_id?: string | null
          file_name?: string | null
          id?: string
          school_id: string
          status?: string
          subject_id: string
          term: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          class_group_id?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_id?: string | null
          file_name?: string | null
          id?: string
          school_id?: string
          status?: string
          subject_id?: string
          term?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siga_lesson_plans_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "siga_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siga_lesson_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      siga_turnstile_devices: {
        Row: {
          api_key: string | null
          created_at: string
          device_type: string
          direction_capability: string
          id: string
          ip_address: string | null
          last_ping_at: string | null
          location: string
          mac_address: string | null
          name: string
          school_id: string
          status: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          device_type?: string
          direction_capability?: string
          id?: string
          ip_address?: string | null
          last_ping_at?: string | null
          location: string
          mac_address?: string | null
          name: string
          school_id: string
          status?: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          device_type?: string
          direction_capability?: string
          id?: string
          ip_address?: string | null
          last_ping_at?: string | null
          location?: string
          mac_address?: string | null
          name?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "siga_turnstile_devices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      slug_reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          session_id: string | null
          slug: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          session_id?: string | null
          slug: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          session_id?: string | null
          slug?: string
          user_id?: string | null
        }
        Relationships: []
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
      student_academic_history: {
        Row: {
          academic_year_label: string
          created_at: string
          created_by: string | null
          final_average: number | null
          grade_level: string
          id: string
          notes: string | null
          outcome: string | null
          previous_school: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_label: string
          created_at?: string
          created_by?: string | null
          final_average?: number | null
          grade_level: string
          id?: string
          notes?: string | null
          outcome?: string | null
          previous_school?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_label?: string
          created_at?: string
          created_by?: string | null
          final_average?: number | null
          grade_level?: string
          id?: string
          notes?: string | null
          outcome?: string | null
          previous_school?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_academic_history_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_academic_history_student_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          created_at: string
          created_by: string
          guardian_person_id: string
          id: string
          is_financially_responsible: boolean
          is_pickup_authorized: boolean
          is_primary: boolean
          relationship: string
          school_id: string
          student_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          guardian_person_id: string
          id?: string
          is_financially_responsible?: boolean
          is_pickup_authorized?: boolean
          is_primary?: boolean
          relationship: string
          school_id: string
          student_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          guardian_person_id?: string
          id?: string
          is_financially_responsible?: boolean
          is_pickup_authorized?: boolean
          is_primary?: boolean
          relationship?: string
          school_id?: string
          student_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_school_id_guardian_person_id_fkey"
            columns: ["school_id", "guardian_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "student_guardians_school_id_student_id_fkey"
            columns: ["school_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      student_status_events: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          reason: string | null
          school_id: string
          student_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          school_id: string
          student_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          school_id?: string
          student_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_status_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_status_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
            referencedRelation: "students"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      students: {
        Row: {
          admission_date: string
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          person_id: string
          school_id: string
          status: string
          student_number: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          admission_date?: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          person_id: string
          school_id: string
          status?: string
          student_number: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          admission_date?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          person_id?: string
          school_id?: string
          status?: string
          student_number?: string
          updated_at?: string
          updated_by?: string
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
            foreignKeyName: "students_school_id_person_id_fkey"
            columns: ["school_id", "person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      subject_types: {
        Row: {
          allows_simultaneous_classes: boolean
          appears_in_pauta: boolean
          can_fail: boolean
          code: string
          color: string | null
          counts_for_gpa: boolean
          created_at: string
          created_by: string | null
          default_weight: number
          deleted_at: string | null
          description: string | null
          has_exam: boolean
          id: string
          is_mandatory: boolean
          name: string
          requires_special_room: boolean
          requires_specialized_teacher: boolean
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          allows_simultaneous_classes?: boolean
          appears_in_pauta?: boolean
          can_fail?: boolean
          code: string
          color?: string | null
          counts_for_gpa?: boolean
          created_at?: string
          created_by?: string | null
          default_weight?: number
          deleted_at?: string | null
          description?: string | null
          has_exam?: boolean
          id?: string
          is_mandatory?: boolean
          name: string
          requires_special_room?: boolean
          requires_specialized_teacher?: boolean
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          allows_simultaneous_classes?: boolean
          appears_in_pauta?: boolean
          can_fail?: boolean
          code?: string
          color?: string | null
          counts_for_gpa?: boolean
          created_at?: string
          created_by?: string | null
          default_weight?: number
          deleted_at?: string | null
          description?: string | null
          has_exam?: boolean
          id?: string
          is_mandatory?: boolean
          name?: string
          requires_special_room?: boolean
          requires_specialized_teacher?: boolean
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "subject_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          annual_hours: number | null
          code: string
          color: string | null
          created_at: string
          created_by: string
          curriculum_area_id: string | null
          default_lesson_duration: number
          deleted_at: string | null
          department: string | null
          description: string | null
          display_order: number
          has_assessment: boolean
          has_attendance: boolean
          has_exam: boolean
          has_pauta: boolean
          icon: string | null
          id: string
          is_mandatory: boolean
          is_practical: boolean
          name: string
          school_id: string
          short_name: string | null
          status: string
          subject_type_id: string | null
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          annual_hours?: number | null
          code: string
          color?: string | null
          created_at?: string
          created_by: string
          curriculum_area_id?: string | null
          default_lesson_duration?: number
          deleted_at?: string | null
          department?: string | null
          description?: string | null
          display_order?: number
          has_assessment?: boolean
          has_attendance?: boolean
          has_exam?: boolean
          has_pauta?: boolean
          icon?: string | null
          id?: string
          is_mandatory?: boolean
          is_practical?: boolean
          name: string
          school_id: string
          short_name?: string | null
          status?: string
          subject_type_id?: string | null
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          annual_hours?: number | null
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string
          curriculum_area_id?: string | null
          default_lesson_duration?: number
          deleted_at?: string | null
          department?: string | null
          description?: string | null
          display_order?: number
          has_assessment?: boolean
          has_attendance?: boolean
          has_exam?: boolean
          has_pauta?: boolean
          icon?: string | null
          id?: string
          is_mandatory?: boolean
          is_practical?: boolean
          name?: string
          school_id?: string
          short_name?: string | null
          status?: string
          subject_type_id?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "subjects_curriculum_area_id_fkey"
            columns: ["curriculum_area_id"]
            isOneToOne: false
            referencedRelation: "curriculum_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_subject_type_id_fkey"
            columns: ["subject_type_id"]
            isOneToOne: false
            referencedRelation: "subject_types"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_addons: {
        Row: {
          activated_at: string
          addon_code: string
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json
          status: string
          subscription_id: string
        }
        Insert: {
          activated_at?: string
          addon_code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          status?: string
          subscription_id: string
        }
        Update: {
          activated_at?: string
          addon_code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_availability: {
        Row: {
          academic_year_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string
          id: string
          is_available: boolean
          max_weekly_hours: number | null
          notes: string | null
          school_id: string
          starts_at: string
          teacher_id: string
          updated_at: string
          updated_by: string | null
          version: number
          weekday: number
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at: string
          id?: string
          is_available?: boolean
          max_weekly_hours?: number | null
          notes?: string | null
          school_id: string
          starts_at: string
          teacher_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekday: number
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string
          id?: string
          is_available?: boolean
          max_weekly_hours?: number | null
          notes?: string | null
          school_id?: string
          starts_at?: string
          teacher_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "teacher_availability_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_availability_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_availability_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_subjects: {
        Row: {
          created_at: string
          created_by: string
          id: string
          school_id: string
          subject_id: string
          teacher_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          school_id: string
          subject_id: string
          teacher_id: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          subject_id?: string
          teacher_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_school_id_subject_id_fkey"
            columns: ["school_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "teacher_subjects_school_id_teacher_id_fkey"
            columns: ["school_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          created_by: string
          employee_number: string
          employment_type: string
          highest_qualification: string
          hired_on: string
          id: string
          person_id: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          employee_number: string
          employment_type: string
          highest_qualification: string
          hired_on: string
          id?: string
          person_id: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          employee_number?: string
          employment_type?: string
          highest_qualification?: string
          hired_on?: string
          id?: string
          person_id?: string
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_person_id_fkey"
            columns: ["school_id", "person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["school_id", "id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          check_count: number
          created_at: string
          hostname: string
          id: string
          last_checked_at: string | null
          ssl_status: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          check_count?: number
          created_at?: string
          hostname: string
          id?: string
          last_checked_at?: string | null
          ssl_status?: string | null
          status?: string
          tenant_id: string
          type: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          check_count?: number
          created_at?: string
          hostname?: string
          id?: string
          last_checked_at?: string | null
          ssl_status?: string | null
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_provisioning: {
        Row: {
          completed_at: string | null
          created_at: string
          domain_status: string
          email_status: string
          error_message: string | null
          id: string
          provisioning_status: string
          school_id: string
          ssl_status: string
          subscription_status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          domain_status?: string
          email_status?: string
          error_message?: string | null
          id?: string
          provisioning_status?: string
          school_id: string
          ssl_status?: string
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          domain_status?: string
          email_status?: string
          error_message?: string | null
          id?: string
          provisioning_status?: string
          school_id?: string
          ssl_status?: string
          subscription_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_provisioning_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage: {
        Row: {
          active_staff_count: number
          active_students_count: number
          api_calls_count: number
          id: string
          last_calculated_at: string
          storage_bytes_used: number
          tenant_id: string
        }
        Insert: {
          active_staff_count?: number
          active_students_count?: number
          api_calls_count?: number
          id?: string
          last_calculated_at?: string
          storage_bytes_used?: number
          tenant_id: string
        }
        Update: {
          active_staff_count?: number
          active_students_count?: number
          api_calls_count?: number
          id?: string
          last_calculated_at?: string
          storage_bytes_used?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          max_storage_gb: number | null
          max_students: number | null
          name: string
          plan_id: string | null
          slug: string
          status: string
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          max_storage_gb?: number | null
          max_students?: number | null
          name: string
          plan_id?: string | null
          slug: string
          status?: string
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          max_storage_gb?: number | null
          max_students?: number | null
          name?: string
          plan_id?: string | null
          slug?: string
          status?: string
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          name: string
          school_id: string
          sequence: number
          starts_on: string
          updated_by: string | null
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          name: string
          school_id: string
          sequence: number
          starts_on: string
          updated_by?: string | null
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          name?: string
          school_id?: string
          sequence?: number
          starts_on?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terms_school_id_academic_year_id_fkey"
            columns: ["school_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["school_id", "id"]
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
          created_by: string
          day_period_number: number | null
          ends_at: string
          id: string
          notes: string | null
          room: string
          room_id: string | null
          schedule_id: string | null
          school_id: string
          shift_id: string | null
          starts_at: string
          status: string
          updated_by: string | null
          weekday: number
        }
        Insert: {
          class_subject_id: string
          created_at?: string
          created_by: string
          day_period_number?: number | null
          ends_at: string
          id?: string
          notes?: string | null
          room: string
          room_id?: string | null
          schedule_id?: string | null
          school_id: string
          shift_id?: string | null
          starts_at: string
          status?: string
          updated_by?: string | null
          weekday: number
        }
        Update: {
          class_subject_id?: string
          created_at?: string
          created_by?: string
          day_period_number?: number | null
          ends_at?: string
          id?: string
          notes?: string | null
          room?: string
          room_id?: string | null
          schedule_id?: string | null
          school_id?: string
          shift_id?: string | null
          starts_at?: string
          status?: string
          updated_by?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "academic_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_class_subject_id_fkey"
            columns: ["school_id", "class_subject_id"]
            isOneToOne: false
            referencedRelation: "class_subjects"
            referencedColumns: ["school_id", "id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "school_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_communication_preferences: {
        Row: {
          academic_enabled: boolean
          announcements_enabled: boolean
          attendance_enabled: boolean
          calendar_enabled: boolean
          channel_preferences: Json
          created_at: string
          documents_enabled: boolean
          events_enabled: boolean
          financial_enabled: boolean
          id: string
          marketing_enabled: boolean
          school_id: string | null
          security_enabled: boolean
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          academic_enabled?: boolean
          announcements_enabled?: boolean
          attendance_enabled?: boolean
          calendar_enabled?: boolean
          channel_preferences?: Json
          created_at?: string
          documents_enabled?: boolean
          events_enabled?: boolean
          financial_enabled?: boolean
          id?: string
          marketing_enabled?: boolean
          school_id?: string | null
          security_enabled?: boolean
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          academic_enabled?: boolean
          announcements_enabled?: boolean
          attendance_enabled?: boolean
          calendar_enabled?: boolean
          channel_preferences?: Json
          created_at?: string
          documents_enabled?: boolean
          events_enabled?: boolean
          financial_enabled?: boolean
          id?: string
          marketing_enabled?: boolean
          school_id?: string | null
          security_enabled?: boolean
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_communication_preferences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_otps: {
        Row: {
          attempts_left: number
          channel_sent: Database["public"]["Enums"]["communication_channel"]
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          purpose: Database["public"]["Enums"]["otp_purpose"]
          requested_ip: string | null
          school_id: string | null
          target_identifier: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          attempts_left?: number
          channel_sent: Database["public"]["Enums"]["communication_channel"]
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          purpose: Database["public"]["Enums"]["otp_purpose"]
          requested_ip?: string | null
          school_id?: string | null
          target_identifier: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          attempts_left?: number
          channel_sent?: Database["public"]["Enums"]["communication_channel"]
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: Database["public"]["Enums"]["otp_purpose"]
          requested_ip?: string | null
          school_id?: string | null
          target_identifier?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_otps_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      act_on_document_signature: {
        Args: {
          note?: string
          school_id: string
          signature_id: string
          status: string
        }
        Returns: Json
      }
      activate_guardian_portal_link: {
        Args: { guardian_person_id: string; school_id: string }
        Returns: Json
      }
      activate_student_portal_link: {
        Args: { school_id: string; student_id: string }
        Returns: Json
      }
      add_student_case_item: {
        Args: {
          case_id: string
          issued_document_id?: string
          item_kind: string
          note_text?: string
          request_id?: string
          school_id: string
        }
        Returns: Json
      }
      approve_school_access_request: {
        Args: {
          p_person_id?: string
          p_request_id: string
          p_reviewer_id: string
        }
        Returns: string
      }
      archive_announcement: {
        Args: { announcement_id: string; school_id: string }
        Returns: Json
      }
      archive_school_record: {
        Args: {
          case_id?: string
          classification?: string
          issued_document_id?: string
          notes?: string
          retention_until?: string
          school_id: string
          student_id?: string
          title: string
        }
        Returns: Json
      }
      assign_school_role: {
        Args: { membership_id: string; role_code: string; school_id: string }
        Returns: Json
      }
      batch_issue_school_documents: {
        Args: {
          requires_signature?: boolean
          school_id: string
          student_ids: string[]
          template_id: string
          title?: string
        }
        Returns: Json
      }
      build_grade_sheet: {
        Args: {
          class_group_id: string
          kind?: string
          school_id: string
          term_id: string
        }
        Returns: Json
      }
      can_manage_students: { Args: never; Returns: boolean }
      can_read_students: { Args: never; Returns: boolean }
      cancel_invoice: {
        Args: { invoice_id: string; reason: string; school_id: string }
        Returns: Json
      }
      claim_guardian_portal: { Args: never; Returns: Json }
      claim_student_portal: { Args: never; Returns: Json }
      close_gradebook: {
        Args: { gradebook_id: string; school_id: string }
        Returns: Json
      }
      configure_class_subject: {
        Args: {
          class_group_id: string
          school_id: string
          subject_id: string
          teacher_id: string
          weekly_periods: number
        }
        Returns: Json
      }
      create_council_minutes: {
        Args: {
          academic_year_id: string
          body: string
          class_group_id: string
          decided_on?: string
          school_id: string
          term_id?: string
          title: string
        }
        Returns: Json
      }
      create_document_request: {
        Args: {
          purpose: string
          request_type: string
          school_id: string
          student_id: string
          template_id?: string
        }
        Returns: Json
      }
      create_financial_contract: {
        Args: {
          discount_percentage?: number
          enrollment_id: string
          school_id: string
        }
        Returns: Json
      }
      create_grade_complaint: {
        Args: {
          deadline_on: string
          enrollment_id: string
          grade_score_id?: string
          grade_sheet_id?: string
          reason: string
          school_id: string
        }
        Returns: Json
      }
      create_student_case: {
        Args: {
          case_type: string
          school_id: string
          student_id: string
          summary?: string
          title: string
        }
        Returns: Json
      }
      create_timetable_slot_guarded: {
        Args: {
          p_actor: string
          p_class_group_id: string
          p_day_period_number: number
          p_ends_at: string
          p_notes: string
          p_room_id: string
          p_room_label: string
          p_schedule_id: string
          p_school_id: string
          p_shift_id: string
          p_starts_at: string
          p_subject_id: string
          p_teacher_id: string
          p_weekday: number
        }
        Returns: {
          class_subject_id: string
          created_at: string
          created_by: string
          day_period_number: number | null
          ends_at: string
          id: string
          notes: string | null
          room: string
          room_id: string | null
          schedule_id: string | null
          school_id: string
          shift_id: string | null
          starts_at: string
          status: string
          updated_by: string | null
          weekday: number
        }
        SetofOptions: {
          from: "*"
          to: "timetable_slots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_profile_role: { Args: never; Returns: string }
      current_school_id: { Args: never; Returns: string }
      current_school_role_is: {
        Args: { p_allowed_roles: string[] }
        Returns: boolean
      }
      current_teacher_can_manage_class_subject: {
        Args: { p_class_group_id: string; p_subject_id: string }
        Returns: boolean
      }
      current_teacher_id: { Args: never; Returns: string }
      current_user_can_manage_assessment_item: {
        Args: {
          p_class_group_id: string
          p_school_id: string
          p_subject_id: string
        }
        Returns: boolean
      }
      current_user_can_manage_assessment_score: {
        Args: {
          p_enrollment_id: string
          p_item_id: string
          p_school_id: string
        }
        Returns: boolean
      }
      delete_sga_assessment_item: {
        Args: {
          p_actor_id: string
          p_force?: boolean
          p_item_id: string
          p_school_id: string
        }
        Returns: number
      }
      enroll_student: {
        Args: {
          class_group_id: string
          enrolled_on: string
          school_id: string
          student_id: string
        }
        Returns: Json
      }
      has_school_permission: {
        Args: { p_permission: string; p_school_id: string }
        Returns: boolean
      }
      hr_apply_approved_salary_change: {
        Args: { p_actor_id: string; p_request_id: string; p_school_id: string }
        Returns: string
      }
      hr_approve_payroll_run: {
        Args: { p_payroll_run_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          competence_month: number
          competence_year: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          school_id: string
          status: string
          total_deductions_kz: number
          total_gross_kz: number
          total_net_kz: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_payroll_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hr_assign_teacher_substitute: {
        Args: {
          p_occurrence_id: string
          p_reason: string
          p_substitute_teacher_id: string
        }
        Returns: string
      }
      hr_authorize_payroll_payment_batch: {
        Args: { p_batch_id: string }
        Returns: {
          authorized_at: string | null
          authorized_by: string | null
          batch_number: string
          blocked_count: number
          created_at: string
          created_by: string | null
          execution_reference: string | null
          id: string
          method: string
          notes: string | null
          payable_count: number
          payroll_run_id: string
          prepared_at: string
          prepared_by: string
          school_id: string
          status: string
          total_amount_kz: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_payroll_payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hr_calculate_payroll_item: {
        Args: { p_employment_id: string; p_payroll_run_id: string }
        Returns: {
          allowances_kz: number
          base_amount_kz: number
          bonuses_kz: number
          calculation_details: Json
          contract_id: string | null
          created_at: string
          created_by: string | null
          deductions_kz: number
          employment_id: string
          gross_amount_kz: number
          hourly_amount_kz: number
          id: string
          net_amount_kz: number
          overtime_kz: number
          payroll_run_id: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_payroll_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hr_calculate_payroll_run: {
        Args: { p_payroll_run_id: string }
        Returns: {
          calculated_items: number
          payroll_run_id: string
          skipped_items: number
          total_deductions_kz: number
          total_gross_kz: number
          total_net_kz: number
        }[]
      }
      hr_confirm_teacher_lesson: {
        Args: {
          p_evidence_method: string
          p_evidence_ref?: string
          p_occurrence_id: string
        }
        Returns: string
      }
      hr_create_extra_teacher_lesson: {
        Args: {
          p_class_subject_id: string
          p_ends_at: string
          p_lesson_date: string
          p_reason: string
          p_starts_at: string
        }
        Returns: string
      }
      hr_create_payroll_payment_batch: {
        Args: { p_payroll_run_id: string }
        Returns: {
          authorized_at: string | null
          authorized_by: string | null
          batch_number: string
          blocked_count: number
          created_at: string
          created_by: string | null
          execution_reference: string | null
          id: string
          method: string
          notes: string | null
          payable_count: number
          payroll_run_id: string
          prepared_at: string
          prepared_by: string
          school_id: string
          status: string
          total_amount_kz: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_payroll_payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hr_create_payroll_run: {
        Args: { p_month: number; p_notes?: string; p_year: number }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          competence_month: number
          competence_year: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          school_id: string
          status: string
          total_deductions_kz: number
          total_gross_kz: number
          total_net_kz: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_payroll_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hr_detect_missed_teacher_lessons: {
        Args: { p_until?: string }
        Returns: number
      }
      hr_evaluate_teacher_attendance_assurance: {
        Args: {
          p_accuracy_m?: number
          p_latitude?: number
          p_longitude?: number
          p_occurrence_id: string
          p_purpose: string
        }
        Returns: {
          assurance_score: number
          decision: string
          distance_from_school_m: number
          evidence_id: string
          inside_geofence: boolean
        }[]
      }
      hr_evaluate_teacher_lesson_attendance: {
        Args: { p_occurrence_id: string }
        Returns: {
          attendance_percent: number
          exception_status: string
          payable_quantity: number
        }[]
      }
      hr_expire_teacher_qr_sessions: {
        Args: { p_occurrence_id?: string }
        Returns: number
      }
      hr_haversine_distance_m: {
        Args: { p_lat1: number; p_lat2: number; p_lon1: number; p_lon2: number }
        Returns: number
      }
      hr_materialize_teacher_lessons: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      hr_recompute_payroll_run_totals: {
        Args: { p_payroll_run_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          competence_month: number
          competence_year: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          school_id: string
          status: string
          total_deductions_kz: number
          total_gross_kz: number
          total_net_kz: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_payroll_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hr_redeem_teacher_qr: {
        Args: { p_token_hash: string }
        Returns: {
          compensation_event_id: string
          occurrence_id: string
          occurrence_status: string
          purpose: string
        }[]
      }
      hr_refresh_payroll_payment_batch: {
        Args: { p_batch_id: string }
        Returns: {
          authorized_at: string | null
          authorized_by: string | null
          batch_number: string
          blocked_count: number
          created_at: string
          created_by: string | null
          execution_reference: string | null
          id: string
          method: string
          notes: string | null
          payable_count: number
          payroll_run_id: string
          prepared_at: string
          prepared_by: string
          school_id: string
          status: string
          total_amount_kz: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_payroll_payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      hr_review_teacher_lesson: {
        Args: {
          p_decision: string
          p_occurrence_id: string
          p_payable_quantity: number
          p_reason: string
        }
        Returns: string
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_school_member: { Args: { p_school_id: string }; Returns: boolean }
      issue_report_cards: {
        Args: { grade_sheet_id: string; school_id: string }
        Returns: Json
      }
      issue_school_document: {
        Args: {
          rendered_body: string
          request_id?: string
          school_id: string
          student_id: string
          template_id: string
          title?: string
        }
        Returns: Json
      }
      mark_all_notifications_read: {
        Args: { school_id: string }
        Returns: Json
      }
      mark_notification_read: {
        Args: { notification_id: string; school_id: string }
        Returns: Json
      }
      next_document_number_service: {
        Args: {
          default_prefix?: string
          document_type: string
          school_id: string
        }
        Returns: string
      }
      open_attendance_session: {
        Args: {
          school_id: string
          session_date: string
          timetable_slot_id: string
        }
        Returns: Json
      }
      open_gradebook: {
        Args: { class_subject_id: string; school_id: string; term_id: string }
        Returns: Json
      }
      portal_list_my_student_profiles: {
        Args: never
        Returns: {
          full_name: string
          school_id: string
          school_name: string
          status: string
          student_id: string
          student_number: string
        }[]
      }
      portal_list_wards: {
        Args: never
        Returns: {
          full_name: string
          is_primary: boolean
          relationship: string
          school_id: string
          school_name: string
          status: string
          student_id: string
          student_number: string
        }[]
      }
      portal_ward_overview: {
        Args: { school_id: string; student_id: string }
        Returns: Json
      }
      publish_announcement: {
        Args: {
          audience?: string
          body: string
          class_group_id?: string
          priority?: string
          role_code?: string
          school_id: string
          title: string
        }
        Returns: Json
      }
      publish_assessment_rule_version: {
        Args: {
          continuous_weight: number
          exam_weight: number
          key_subject_ids?: string[]
          key_subjects_cause_failure?: boolean
          lock_after_publication: boolean
          maximum_absence_percentage: number
          passing_grade: number
          require_change_approval: boolean
          rounding_method: string
          school_id: string
        }
        Returns: Json
      }
      publish_document_template: {
        Args: {
          allowed_fields?: Json
          body_template: string
          code: string
          document_type: string
          name: string
          school_id: string
        }
        Returns: Json
      }
      register_payment: {
        Args: {
          amount: number
          invoice_id: string
          paid_on?: string
          payment_method: string
          school_id: string
        }
        Returns: Json
      }
      register_student: {
        Args: {
          admission_date: string
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
      register_teacher: {
        Args: {
          employment_type: string
          highest_qualification: string
          hired_on: string
          person_id: string
          school_id: string
          subject_ids?: string[]
        }
        Returns: Json
      }
      render_document_placeholders: {
        Args: { body_template: string; school_id: string; student_id: string }
        Returns: string
      }
      reopen_attendance: {
        Args: {
          attendance_session_id: string
          reason: string
          school_id: string
        }
        Returns: Json
      }
      reopen_gradebook: {
        Args: { gradebook_id: string; reason: string; school_id: string }
        Returns: Json
      }
      replace_curriculum_subjects: {
        Args: {
          p_actor: string
          p_curriculum_id: string
          p_rows: Json
          p_school_id: string
        }
        Returns: undefined
      }
      replace_teacher_availability: {
        Args: {
          p_academic_year_id: string
          p_actor: string
          p_max_weekly_hours: number
          p_rows: Json
          p_school_id: string
          p_teacher_id: string
        }
        Returns: undefined
      }
      request_document_signature: {
        Args: {
          document_id: string
          note?: string
          school_id: string
          signer_role: string
        }
        Returns: Json
      }
      respond_grade_complaint: {
        Args: {
          complaint_id: string
          response: string
          school_id: string
          status: string
        }
        Returns: Json
      }
      reverse_receipt: {
        Args: { reason: string; receipt_id: string; school_id: string }
        Returns: Json
      }
      review_document_request: {
        Args: {
          request_id: string
          review_note?: string
          school_id: string
          status: string
        }
        Returns: Json
      }
      review_grade_change: {
        Args: {
          approve: boolean
          grade_score_id: string
          review_note?: string
          school_id: string
        }
        Returns: Json
      }
      revoke_school_document: {
        Args: { document_id: string; reason: string; school_id: string }
        Returns: Json
      }
      revoke_school_role: {
        Args: { membership_id: string; role_code: string; school_id: string }
        Returns: Json
      }
      save_academic_calendar: {
        Args: {
          p_academic_year_id: string
          p_actor_id: string
          p_ends_on: string
          p_school_id: string
          p_starts_on: string
          p_terms: Json
          p_year_name: string
        }
        Returns: string
      }
      schedule_lesson: {
        Args: {
          class_subject_id: string
          ends_at: string
          room: string
          school_id: string
          starts_at: string
          weekday: number
        }
        Returns: Json
      }
      siga_alumni_profile_completion: {
        Args: { target: Database["public"]["Tables"]["alumni_profiles"]["Row"] }
        Returns: number
      }
      submit_approved_school_enrollment: {
        Args: { p_payload: Json; p_request_id: string; p_user_id: string }
        Returns: string
      }
      submit_attendance: {
        Args: {
          attendance_session_id: string
          records: Json
          school_id: string
          submission_key: string
        }
        Returns: Json
      }
      submit_gradebook: {
        Args: { gradebook_id: string; school_id: string }
        Returns: Json
      }
      transition_grade_sheet: {
        Args: {
          grade_sheet_id: string
          reason?: string
          school_id: string
          status: string
        }
        Returns: Json
      }
      update_enrollment_status: {
        Args: {
          end_reason?: string
          ended_on?: string
          enrollment_id: string
          school_id: string
          status: string
        }
        Returns: Json
      }
      update_student_case_status: {
        Args: { case_id: string; school_id: string; status: string }
        Returns: Json
      }
      update_timetable_slot_guarded: {
        Args: {
          p_actor: string
          p_day_period_number: number
          p_ends_at: string
          p_notes: string
          p_room_id: string
          p_room_label: string
          p_schedule_id: string
          p_school_id: string
          p_shift_id: string
          p_slot_id: string
          p_starts_at: string
          p_subject_id: string
          p_teacher_id: string
          p_weekday: number
        }
        Returns: {
          class_subject_id: string
          created_at: string
          created_by: string
          day_period_number: number | null
          ends_at: string
          id: string
          notes: string | null
          room: string
          room_id: string | null
          schedule_id: string | null
          school_id: string
          shift_id: string | null
          starts_at: string
          status: string
          updated_by: string | null
          weekday: number
        }
        SetofOptions: {
          from: "*"
          to: "timetable_slots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_grade_item: {
        Args: {
          assessed_on?: string
          code: string
          gradebook_id: string
          kind: string
          max_score: number
          name: string
          school_id: string
          sequence?: number
          weight: number
        }
        Returns: Json
      }
      upsert_grade_score: {
        Args: {
          enrollment_id: string
          grade_item_id: string
          note?: string
          reason?: string
          school_id: string
          score: number
        }
        Returns: Json
      }
      validate_issued_document: {
        Args: { validation_code: string }
        Returns: Json
      }
    }
    Enums: {
      communication_channel: "email" | "sms" | "whatsapp"
      dispatch_status:
        | "pending"
        | "queued"
        | "sent"
        | "delivered"
        | "opened"
        | "clicked"
        | "failed"
        | "bounced"
      otp_purpose:
        | "signup_verification"
        | "login_2fa"
        | "password_reset"
        | "phone_change"
        | "email_change"
        | "payflow_sensitive_op"
        | "grade_approval"
        | "admin_step_up"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      communication_channel: ["email", "sms", "whatsapp"],
      dispatch_status: [
        "pending",
        "queued",
        "sent",
        "delivered",
        "opened",
        "clicked",
        "failed",
        "bounced",
      ],
      otp_purpose: [
        "signup_verification",
        "login_2fa",
        "password_reset",
        "phone_change",
        "email_change",
        "payflow_sensitive_op",
        "grade_approval",
        "admin_step_up",
      ],
    },
  },
} as const
