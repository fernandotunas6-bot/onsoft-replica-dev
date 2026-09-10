const fs = require("fs");
const file = "src/integrations/supabase/types.ts";
let data = fs.readFileSync(file, "utf8");

const tablesToAdd = `      permissions: {
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
`;

if (!data.includes("school_memberships: {")) {
  data = data.replace("    Tables: {", "    Tables: {\n" + tablesToAdd);
}

// Modify profiles to remove mandatory cargo/school_id and add new fields
data = data.replace(
  /avatar_url: string \| null;\n[ ]+cargo: string;\n[ ]+created_at: string;\n[ ]+full_name: string \| null;\n[ ]+id: string;\n[ ]+school_id: string;/g,
  "avatar_url: string | null;\n          cargo: string | null;\n          first_name: string | null;\n          last_name: string | null;\n          phone: string | null;\n          status: string | null;\n          created_at: string;\n          full_name: string | null;\n          id: string;\n          school_id: string | null;",
);

data = data.replace(
  /avatar_url\?: string \| null;\n[ ]+cargo\?: string;\n[ ]+created_at\?: string;\n[ ]+full_name\?: string \| null;\n[ ]+id: string;\n[ ]+school_id: string;/g,
  "avatar_url?: string | null;\n          cargo?: string | null;\n          first_name?: string | null;\n          last_name?: string | null;\n          phone?: string | null;\n          status?: string | null;\n          created_at?: string;\n          full_name?: string | null;\n          id: string;\n          school_id?: string | null;",
);

data = data.replace(
  /avatar_url\?: string \| null;\n[ ]+cargo\?: string;\n[ ]+created_at\?: string;\n[ ]+full_name\?: string \| null;\n[ ]+id\?: string;\n[ ]+school_id\?: string;/g,
  "avatar_url?: string | null;\n          cargo?: string | null;\n          first_name?: string | null;\n          last_name?: string | null;\n          phone?: string | null;\n          status?: string | null;\n          created_at?: string;\n          full_name?: string | null;\n          id?: string;\n          school_id?: string | null;",
);

fs.writeFileSync(file, data);
console.log("Types patched successfully");
