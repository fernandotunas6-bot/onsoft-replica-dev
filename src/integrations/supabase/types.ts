export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type FinanceVersionedRow = {
  id: string;
  school_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

type FinanceVersionedInsert = {
  id?: string;
  school_id: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string | null;
  version?: number;
};

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      permissions: {
        Row: { id: string; code: string; description: string | null; created_at: string; };
        Insert: { id?: string; code: string; description?: string | null; created_at?: string; };
        Update: { id?: string; code?: string; description?: string | null; created_at?: string; };
        Relationships: [];
      };
      roles: {
        Row: { id: string; name: string; description: string | null; is_system: boolean; created_at: string; };
        Insert: { id?: string; name: string; description?: string | null; is_system?: boolean; created_at?: string; };
        Update: { id?: string; name?: string; description?: string | null; is_system?: boolean; created_at?: string; };
        Relationships: [];
      };
      role_permissions: {
        Row: { role_id: string; permission_id: string; created_at: string; };
        Insert: { role_id: string; permission_id: string; created_at?: string; };
        Update: { role_id?: string; permission_id?: string; created_at?: string; };
        Relationships: [
          { foreignKeyName: "role_permissions_role_id_fkey"; columns: ["role_id"]; isOneToOne: false; referencedRelation: "roles"; referencedColumns: ["id"]; },
          { foreignKeyName: "role_permissions_permission_id_fkey"; columns: ["permission_id"]; isOneToOne: false; referencedRelation: "permissions"; referencedColumns: ["id"]; }
        ];
      };
      school_memberships: {
        Row: { id: string; school_id: string; user_id: string; status: string; joined_at: string; invited_at: string | null; activated_at: string | null; suspended_at: string | null; last_access_at: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; school_id: string; user_id: string; status?: string; joined_at?: string; invited_at?: string | null; activated_at?: string | null; suspended_at?: string | null; last_access_at?: string | null; created_at?: string; updated_at?: string; };
        Update: { id?: string; school_id?: string; user_id?: string; status?: string; joined_at?: string; invited_at?: string | null; activated_at?: string | null; suspended_at?: string | null; last_access_at?: string | null; created_at?: string; updated_at?: string; };
        Relationships: [
          { foreignKeyName: "school_memberships_school_id_fkey"; columns: ["school_id"]; isOneToOne: false; referencedRelation: "schools"; referencedColumns: ["id"]; },
          { foreignKeyName: "school_memberships_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"]; }
        ];
      };
      school_membership_roles: {
        Row: { membership_id: string; role_id: string; created_at: string; };
        Insert: { membership_id: string; role_id: string; created_at?: string; };
        Update: { membership_id?: string; role_id?: string; created_at?: string; };
        Relationships: [
          { foreignKeyName: "school_membership_roles_membership_id_fkey"; columns: ["membership_id"]; isOneToOne: false; referencedRelation: "school_memberships"; referencedColumns: ["id"]; },
          { foreignKeyName: "school_membership_roles_role_id_fkey"; columns: ["role_id"]; isOneToOne: false; referencedRelation: "roles"; referencedColumns: ["id"]; }
        ];
      };

      schools: {
        Row: {
          id: string;
          name: string;
          short_name: string | null;
          nif: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          director_name: string | null;
          academic_year: string | null;
          currency: string;
          evaluation_periods: number;
          passing_grade: number;
          preferences: Json;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          name: string;
          short_name?: string | null;
          nif?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          director_name?: string | null;
          academic_year?: string | null;
          currency?: string;
          evaluation_periods?: number;
          passing_grade?: number;
          preferences?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          name?: string;
          short_name?: string | null;
          nif?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          director_name?: string | null;
          academic_year?: string | null;
          currency?: string;
          evaluation_periods?: number;
          passing_grade?: number;
          preferences?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          description: string | null;
          event_date: string;
          ends_on: string | null;
          category: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          title: string;
          description?: string | null;
          event_date: string;
          ends_on?: string | null;
          category?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          title?: string;
          description?: string | null;
          event_date?: string;
          ends_on?: string | null;
          category?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      school_announcements: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          body: string;
          audience: string;
          channel: string;
          status: string;
          scheduled_for: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          title: string;
          body: string;
          audience: string;
          channel: string;
          status?: string;
          scheduled_for?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          title?: string;
          body?: string;
          audience?: string;
          channel?: string;
          status?: string;
          scheduled_for?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "school_announcements_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      attachments: {
        Row: {
          id: string;
          school_id: string;
          owner_type: string;
          owner_id: string;
          category: string | null;
          bucket: string;
          path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          owner_type: string;
          owner_id: string;
          category?: string | null;
          bucket?: string;
          path: string;
          file_name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          owner_type?: string;
          owner_id?: string;
          category?: string | null;
          bucket?: string;
          path?: string;
          file_name?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      school_billing_settings: {
        Row: {
          id: string;
          school_id: string;
          due_day: number;
          late_fee_percent: number;
          grace_days: number;
          sibling_discount_percent: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          due_day?: number;
          late_fee_percent?: number;
          grace_days?: number;
          sibling_discount_percent?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          due_day?: number;
          late_fee_percent?: number;
          grace_days?: number;
          sibling_discount_percent?: number;
        };
        Relationships: [];
      };
      invoices: {
        Row: FinanceVersionedRow & {
          student_id: string;
          enrollment_id: string | null;
          number: string;
          description: string | null;
          issued_on: string;
          due_on: string;
          currency: string;
          status: string;
          subtotal: number;
          discount_amount: number;
          late_fee_amount: number;
          total_amount: number;
          amount_paid: number;
          deleted_at: string | null;
        };
        Insert: FinanceVersionedInsert & {
          student_id: string;
          enrollment_id?: string | null;
          number: string;
          description?: string | null;
          issued_on?: string;
          due_on: string;
          currency?: string;
          status?: string;
          subtotal: number;
          discount_amount?: number;
          late_fee_amount?: number;
          total_amount: number;
          amount_paid?: number;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
      finance_students: {
        Row: {
          school_id: string;
          student_id: string;
          full_name: string;
          registration_number: string;
          student_status: string;
          updated_at: string;
        };
        Insert: {
          school_id: string;
          student_id: string;
          full_name: string;
          registration_number: string;
          student_status: string;
          updated_at?: string;
        };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      financial_reversals: {
        Row: {
          id: string;
          school_id: string;
          cash_entry_id: string;
          payment_id: string | null;
          reason: string;
          reversed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          cash_entry_id: string;
          payment_id?: string | null;
          reason: string;
          reversed_by?: string;
          created_at?: string;
        };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      document_templates: {
        Row: FinanceVersionedRow & {
          code: string;
          name: string;
          fee_amount: number;
          turnaround_days: number;
          requires_payment: boolean;
          active: boolean;
        };
        Insert: FinanceVersionedInsert & {
          code: string;
          name: string;
          fee_amount?: number;
          turnaround_days?: number;
          requires_payment?: boolean;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["document_templates"]["Insert"]>;
        Relationships: [];
      };
      document_requests: {
        Row: FinanceVersionedRow & {
          request_number: string;
          student_id: string;
          template_id: string;
          template_name: string;
          fee_amount: number;
          status: string;
          priority: string;
          requested_at: string;
          due_on: string;
          completed_at: string | null;
          assigned_to: string | null;
          notes: string | null;
        };
        Insert: FinanceVersionedInsert & {
          request_number: string;
          student_id: string;
          template_id: string;
          template_name: string;
          fee_amount: number;
          status: string;
          priority?: string;
          requested_at?: string;
          due_on: string;
          completed_at?: string | null;
          assigned_to?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["document_requests"]["Insert"]>;
        Relationships: [];
      };
      document_request_status_history: {
        Row: {
          id: string;
          school_id: string;
          request_id: string;
          previous_status: string | null;
          new_status: string;
          reason: string | null;
          changed_by: string;
          created_at: string;
        };
        Insert: Record<PropertyKey, never>;
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      invoice_items: {
        Row: {
          id: string;
          school_id: string;
          invoice_id: string;
          category: string;
          description: string;
          quantity: number;
          unit_price: number;
          discount_amount: number;
          line_total: number;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          invoice_id: string;
          category: string;
          description: string;
          quantity?: number;
          unit_price: number;
          discount_amount?: number;
          created_at?: string;
          created_by?: string;
        };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      payments: {
        Row: FinanceVersionedRow & {
          student_id: string;
          receipt_number: string;
          paid_at: string;
          amount: number;
          currency: string;
          method: string;
          reference: string | null;
          status: string;
        };
        Insert: FinanceVersionedInsert & {
          student_id: string;
          receipt_number: string;
          paid_at?: string;
          amount: number;
          currency?: string;
          method: string;
          reference?: string | null;
          status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      payment_allocations: {
        Row: {
          school_id: string;
          payment_id: string;
          invoice_id: string;
          student_id: string;
          amount: number;
          created_at: string;
          created_by: string;
        };
        Insert: {
          school_id: string;
          payment_id: string;
          invoice_id: string;
          student_id: string;
          amount: number;
          created_at?: string;
          created_by?: string;
        };
        Update: Record<PropertyKey, never>;
        Relationships: [];
      };
      cash_entries: {
        Row: FinanceVersionedRow & {
          payment_id: string | null;
          document_number: string;
          direction: string;
          category: string;
          description: string;
          amount: number;
          method: string;
          reference: string | null;
          occurred_at: string;
          status: string;
        };
        Insert: FinanceVersionedInsert & {
          payment_id?: string | null;
          document_number: string;
          direction: string;
          category: string;
          description: string;
          amount: number;
          method: string;
          reference?: string | null;
          occurred_at?: string;
          status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cash_entries"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          school_id: string;
          actor_id: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          reason: string | null;
          before_data: Json | null;
          after_data: Json | null;
          ip: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          actor_id: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          reason?: string | null;
          before_data?: Json | null;
          after_data?: Json | null;
          ip?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          actor_id?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          reason?: string | null;
          before_data?: Json | null;
          after_data?: Json | null;
          ip?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      people: {
        Row: {
          id: string;
          school_id: string;
          internal_code: string | null;
          full_name: string;
          first_name: string | null;
          last_name: string | null;
          preferred_name: string | null;
          photo_url: string | null;
          sex: string | null;
          birth_date: string | null;
          marital_status: string | null;
          nationality: string | null;
          birth_place: string | null;
          province: string | null;
          municipality: string | null;
          commune: string | null;
          address: string | null;
          phone_primary: string | null;
          phone_alternative: string | null;
          whatsapp: string | null;
          email: string | null;
          nif: string | null;
          profession: string | null;
          religion: string | null;
          special_needs: string | null;
          notes: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          internal_code?: string | null;
          full_name: string;
          first_name?: string | null;
          last_name?: string | null;
          preferred_name?: string | null;
          photo_url?: string | null;
          sex?: string | null;
          birth_date?: string | null;
          marital_status?: string | null;
          nationality?: string | null;
          birth_place?: string | null;
          province?: string | null;
          municipality?: string | null;
          commune?: string | null;
          address?: string | null;
          phone_primary?: string | null;
          phone_alternative?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          nif?: string | null;
          profession?: string | null;
          religion?: string | null;
          special_needs?: string | null;
          notes?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          internal_code?: string | null;
          full_name?: string;
          first_name?: string | null;
          last_name?: string | null;
          preferred_name?: string | null;
          photo_url?: string | null;
          sex?: string | null;
          birth_date?: string | null;
          marital_status?: string | null;
          nationality?: string | null;
          birth_place?: string | null;
          province?: string | null;
          municipality?: string | null;
          commune?: string | null;
          address?: string | null;
          phone_primary?: string | null;
          phone_alternative?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          nif?: string | null;
          profession?: string | null;
          religion?: string | null;
          special_needs?: string | null;
          notes?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      person_documents: {
        Row: {
          id: string;
          school_id: string;
          person_id: string;
          document_type: string;
          document_number: string;
          issued_at: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          person_id: string;
          document_type: string;
          document_number: string;
          issued_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          person_id?: string;
          document_type?: string;
          document_number?: string;
          issued_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "person_documents_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      person_roles: {
        Row: {
          id: string;
          school_id: string;
          person_id: string;
          role: string;
          active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          person_id: string;
          role: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          person_id?: string;
          role?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "person_roles_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      person_relationships: {
        Row: {
          id: string;
          school_id: string;
          person_id: string;
          related_person_id: string;
          relationship_type: string;
          priority: number | null;
          authorized: boolean;
          valid_from: string | null;
          valid_until: string | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          person_id: string;
          related_person_id: string;
          relationship_type: string;
          priority?: number | null;
          authorized?: boolean;
          valid_from?: string | null;
          valid_until?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          person_id?: string;
          related_person_id?: string;
          relationship_type?: string;
          priority?: number | null;
          authorized?: boolean;
          valid_from?: string | null;
          valid_until?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "person_relationships_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "person_relationships_related_person_id_fkey";
            columns: ["related_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      person_school_links: {
        Row: {
          id: string;
          school_id: string;
          person_id: string;
          link_type: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          person_id: string;
          link_type?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          person_id?: string;
          link_type?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "person_school_links_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      academic_years: {
        Row: {
          id: string;
          school_id: string;
          code: string;
          name: string;
          starts_on: string;
          ends_on: string;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          code: string;
          name: string;
          starts_on: string;
          ends_on: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          code?: string;
          name?: string;
          starts_on?: string;
          ends_on?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          school_id: string;
          code: string;
          name: string;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          code: string;
          name: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          code?: string;
          name?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      grade_levels: {
        Row: {
          id: string;
          school_id: string;
          code: string;
          name: string;
          sort_order: number;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          code: string;
          name: string;
          sort_order: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          code?: string;
          name?: string;
          sort_order?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          school_id: string;
          code: string;
          name: string;
          capacity: number | null;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          code: string;
          name: string;
          capacity?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          code?: string;
          name?: string;
          capacity?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      students: {
        Row: {
          id: string;
          school_id: string;
          person_id: string;
          registration_number: string;
          status: string;
          admitted_on: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          person_id: string;
          registration_number: string;
          status?: string;
          admitted_on?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          person_id?: string;
          registration_number?: string;
          status?: string;
          admitted_on?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "students_school_person_fkey";
            columns: ["school_id", "person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      student_guardians: {
        Row: {
          school_id: string;
          student_id: string;
          guardian_person_id: string;
          relationship: string;
          is_primary: boolean;
          authorized_pickup: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          school_id: string;
          student_id: string;
          guardian_person_id: string;
          relationship: string;
          is_primary?: boolean;
          authorized_pickup?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          school_id?: string;
          student_id?: string;
          guardian_person_id?: string;
          relationship?: string;
          is_primary?: boolean;
          authorized_pickup?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "student_guardians_student_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "student_guardians_person_fkey";
            columns: ["school_id", "guardian_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      class_groups: {
        Row: {
          id: string;
          school_id: string;
          academic_year_id: string;
          course_id: string;
          grade_level_id: string;
          room_id: string | null;
          code: string;
          name: string;
          shift: string;
          capacity: number | null;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          academic_year_id: string;
          course_id: string;
          grade_level_id: string;
          room_id?: string | null;
          code: string;
          name: string;
          shift: string;
          capacity?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          academic_year_id?: string;
          course_id?: string;
          grade_level_id?: string;
          room_id?: string | null;
          code?: string;
          name?: string;
          shift?: string;
          capacity?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "class_groups_year_fkey";
            columns: ["school_id", "academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "class_groups_course_fkey";
            columns: ["school_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "class_groups_grade_fkey";
            columns: ["school_id", "grade_level_id"];
            isOneToOne: false;
            referencedRelation: "grade_levels";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      subjects: {
        Row: {
          id: string;
          school_id: string;
          code: string;
          name: string;
          teacher_name: string | null;
          weekly_hours: number;
          grade_from: number | null;
          grade_to: number | null;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          code: string;
          name: string;
          teacher_name?: string | null;
          weekly_hours?: number;
          grade_from?: number | null;
          grade_to?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          code?: string;
          name?: string;
          teacher_name?: string | null;
          weekly_hours?: number;
          grade_from?: number | null;
          grade_to?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      term_grades: {
        Row: {
          id: string;
          school_id: string;
          enrollment_id: string;
          subject_id: string;
          term: number;
          mac: number;
          npp: number;
          npt: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          enrollment_id: string;
          subject_id: string;
          term: number;
          mac: number;
          npp: number;
          npt: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          enrollment_id?: string;
          subject_id?: string;
          term?: number;
          mac?: number;
          npp?: number;
          npt?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "term_grades_enrollment_fkey";
            columns: ["school_id", "enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "term_grades_subject_fkey";
            columns: ["school_id", "subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      class_schedule_slots: {
        Row: {
          id: string;
          school_id: string;
          class_group_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          subject_id: string | null;
          label: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          class_group_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          subject_id?: string | null;
          label?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          class_group_id?: string;
          weekday?: number;
          starts_at?: string;
          ends_at?: string;
          subject_id?: string | null;
          label?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "class_schedule_slots_group_fkey";
            columns: ["school_id", "class_group_id"];
            isOneToOne: false;
            referencedRelation: "class_groups";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "class_schedule_slots_subject_fkey";
            columns: ["school_id", "subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      enrollments: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          academic_year_id: string;
          class_group_id: string;
          status: string;
          payment_status: string;
          enrolled_on: string;
          final_average: number | null;
          attendance_rate: number | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          student_id: string;
          academic_year_id: string;
          class_group_id: string;
          status?: string;
          payment_status?: string;
          enrolled_on?: string;
          final_average?: number | null;
          attendance_rate?: number | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          student_id?: string;
          academic_year_id?: string;
          class_group_id?: string;
          status?: string;
          payment_status?: string;
          enrolled_on?: string;
          final_average?: number | null;
          attendance_rate?: number | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_student_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "enrollments_group_fkey";
            columns: ["school_id", "class_group_id"];
            isOneToOne: false;
            referencedRelation: "class_groups";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      student_status_history: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          previous_status: string | null;
          new_status: string;
          reason: string | null;
          changed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          student_id: string;
          previous_status?: string | null;
          new_status: string;
          reason?: string | null;
          changed_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          student_id?: string;
          previous_status?: string | null;
          new_status?: string;
          reason?: string | null;
          changed_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string;
          connector_id: string;
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          connection_key_ciphertext: string;
          connector_id: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          connection_key_ciphertext?: string;
          connector_id?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          cargo: string | null;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          status: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          school_id: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          cargo?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          status?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          school_id?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          cargo?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          status?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          school_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      student_directory: {
        Row: {
          id: string;
          school_id: string;
          person_id: string;
          registration_number: string;
          full_name: string;
          gender: string | null;
          birth_date: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          person_version: number;
          student_status: string;
          enrollment_status: string | null;
          payment_status: string | null;
          enrolled_on: string | null;
          final_average: number | null;
          attendance_rate: number | null;
          academic_year: string | null;
          course_name: string | null;
          grade_name: string | null;
          class_code: string | null;
          class_name: string | null;
          shift: string | null;
          room_name: string | null;
          primary_guardian_name: string | null;
          primary_guardian_phone: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      // As 3 seguintes existem mesmo no projecto SGA real (private.*, com is_aal2()
      // + has_permission() + lock de linha). O resto deste bloco Functions foi
      // gerado a partir do schema Lovable antigo e não reflecte o SGA — ver
      // docs/agents/CONTINUE.md.
      register_payment: {
        Args: {
          school_id: string;
          invoice_id: string;
          amount: number;
          payment_method: "cash" | "bank_transfer" | "card" | "other";
          paid_on?: string;
        };
        Returns: { receiptId: string; receiptNumber: string; invoiceStatus: string };
      };
      enroll_student: {
        Args: {
          school_id: string;
          student_id: string;
          class_group_id: string;
          enrolled_on: string;
        };
        Returns: {
          enrollmentId: string;
          enrollmentNumber: string;
          classGroupId: string;
          status: string;
        };
      };
      register_student: {
        Args: {
          school_id: string;
          person_id: string;
          admission_date: string;
          guardian_person_id?: string | null;
          relationship?: string | null;
          primary_guardian?: boolean;
          financial_responsibility?: boolean;
          pickup_authorization?: boolean;
        };
        Returns: { studentId: string; studentNumber: string; status: string };
      };
      can_manage_finance: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      record_invoice_payment: {
        Args: {
          p_invoice_id: string;
          p_receipt_number: string;
          p_amount: number;
          p_method: string;
          p_reference?: string | null;
          p_paid_at?: string;
        };
        Returns: Database["public"]["Tables"]["payments"]["Row"];
      };
      issue_invoice: {
        Args: {
          p_student_id: string;
          p_number: string;
          p_due_on: string;
          p_description: string;
          p_items: Json;
          p_enrollment_id?: string | null;
          p_issued_on?: string;
        };
        Returns: Database["public"]["Tables"]["invoices"]["Row"];
      };
      finance_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          billed: number;
          received: number;
          outstanding: number;
          overdue: number;
          cash_in: number;
          cash_out: number;
          cash_balance: number;
          invoice_count: number;
          open_invoice_count: number;
          overdue_invoice_count: number;
          billed_student_count: number;
        }[];
      };
      finance_monthly_summary: {
        Args: { p_months?: number };
        Returns: {
          month_start: string;
          billed: number;
          received: number;
          cash_in: number;
          cash_out: number;
        }[];
      };
      finance_category_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          direction: string;
          category: string;
          amount: number;
          entry_count: number;
        }[];
      };
      record_cash_expense: {
        Args: {
          p_document_number: string;
          p_description: string;
          p_category: string;
          p_amount: number;
          p_method: string;
          p_reference?: string | null;
          p_occurred_at?: string;
        };
        Returns: Database["public"]["Tables"]["cash_entries"]["Row"];
      };
      reverse_cash_entry: {
        Args: { p_cash_entry_id: string; p_reason: string };
        Returns: Database["public"]["Tables"]["financial_reversals"]["Row"];
      };
      can_manage_documents: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      create_document_request: {
        Args: {
          p_student_id: string;
          p_template_id: string;
          p_request_number: string;
          p_priority?: string;
          p_due_on?: string | null;
          p_notes?: string | null;
        };
        Returns: Database["public"]["Tables"]["document_requests"]["Row"];
      };
      current_school_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_profile_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      can_read_students: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      can_manage_students: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      create_person: {
        Args: {
          p_person: Json;
          p_roles?: string[];
          p_documents?: Json;
          p_relationships?: Json;
          p_duplicate_decision?: string | null;
        };
        Returns: Database["public"]["Tables"]["people"]["Row"];
      };
      create_student: {
        Args: {
          p_person_id: string;
          p_registration_number: string;
          p_class_group_id?: string | null;
          p_academic_year_id?: string | null;
          p_admitted_on?: string | null;
          p_guardians?: Json;
        };
        Returns: Database["public"]["Tables"]["students"]["Row"];
      };
      enroll_new_student: {
        Args: {
          p_person: Json;
          p_registration_number: string;
          p_class_group_id?: string | null;
          p_academic_year_id?: string | null;
          p_admitted_on?: string | null;
          p_guardians?: Json;
          p_duplicate_decision?: string | null;
        };
        Returns: Database["public"]["Tables"]["students"]["Row"];
      };
      change_student_status: {
        Args: { p_student_id: string; p_new_status: string; p_reason?: string | null };
        Returns: Database["public"]["Tables"]["students"]["Row"];
      };
      search_students: {
        Args: { p_query?: string | null; p_limit?: number; p_offset?: number };
        Returns: Database["public"]["Views"]["student_directory"]["Row"][];
      };
      search_people: {
        Args: { p_query: string; p_limit?: number };
        Returns: Database["public"]["Tables"]["people"]["Row"][];
      };
      find_person_duplicates: {
        Args: {
          p_full_name: string;
          p_birth_date?: string | null;
          p_document_number?: string | null;
          p_nif?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
        };
        Returns: {
          person_id: string;
          full_name: string;
          match_reason: string;
          score: number;
        }[];
      };
      merge_people: {
        Args: { p_survivor_id: string; p_duplicate_id: string; p_reason: string };
        Returns: Database["public"]["Tables"]["people"]["Row"];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
