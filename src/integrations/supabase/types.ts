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
            foreignKeyName: "person_relationships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_relationships_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_relationships_school_id_fkey"
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
            foreignKeyName: "person_school_links_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_school_links_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
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
      schools: {
        Row: {
          academic_year: string | null
          address: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          nif: string | null
          phone: string | null
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
          email?: string | null
          id?: string
          name: string
          nif?: string | null
          phone?: string | null
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
          email?: string | null
          id?: string
          name?: string
          nif?: string | null
          phone?: string | null
          short_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_students: { Args: never; Returns: boolean }
      can_read_students: { Args: never; Returns: boolean }
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
      current_profile_role: { Args: never; Returns: string }
      current_school_id: { Args: never; Returns: string }
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
