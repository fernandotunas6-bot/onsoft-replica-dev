export type TenantStatus =
  | "provisioning"
  | "provisioning_failed"
  | "trial"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled"
  | "archived";

export type SubscriptionLifecycle = "trialing" | "active" | "past_due" | "canceled" | "unpaid";

export interface SaaSStats {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  totalStudents: number;
  mrrAoa: number;
  arrAoa: number;
  totalStorageGb: number;
}

export interface Plan {
  id: string;
  name: string;
  code: "start" | "professional" | "business" | "enterprise";
  description: string;
  max_students: number;
  max_staff: number;
  max_storage_gb: number;
  price_aoa_monthly: number;
  price_aoa_yearly: number;
  features: {
    academic: boolean;
    finance: boolean;
    attendance: boolean;
    documents: boolean;
    parents_portal?: boolean;
    student_portal?: boolean;
    teacher_portal?: boolean;
    whatsapp?: boolean;
    sms?: boolean;
    analytics?: boolean;
    ai?: boolean;
    api?: boolean;
    custom_domain?: boolean;
  };
  is_active: boolean;
  created_at?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan_id?: string;
  subscription_status?: SubscriptionLifecycle;
  trial_ends_at?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  max_students: number;
  max_storage_gb: number;
  created_at: string;
  updated_at: string;
  plans?: Plan;
  tenant_usage?: TenantUsage | TenantUsage[];
  /** Derivado de `tenant_usage` para listagens ADMIN. */
  active_students_count?: number;
  usage_last_calculated_at?: string;
}

export interface PlatformAdminRow {
  user_id: string;
  email: string | null;
  created_at: string;
}

export interface SaasAuditLogRow {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  tenant_name?: string | null;
  tenant_slug?: string | null;
}

export interface TenantDomain {
  id: string;
  tenant_id: string;
  hostname: string;
  type: "siga_subdomain" | "custom_domain";
  status: "pending" | "active" | "failed";
  ssl_status: string;
  verified_at?: string;
  created_at: string;
  tenant_name?: string | null;
  tenant_slug?: string | null;
}

export interface TenantUsage {
  id: string;
  tenant_id: string;
  active_students_count: number;
  active_staff_count: number;
  storage_bytes_used: number;
  api_calls_count: number;
  last_calculated_at: string;
}

export interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionLifecycle;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  plan_name?: string | null;
  plan_code?: string | null;
  price_aoa_monthly?: number | null;
}

export interface CreateSchoolWizardData {
  // Step 1: Institution
  name: string;
  commercial_name?: string;
  nif?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  logo_url?: string;

  // Step 2: Manager
  contact_name: string;
  contact_role?: string;
  contact_phone?: string;
  contact_email: string;

  // Step 3: Plan
  plan_code: "start" | "professional" | "business" | "enterprise";
  trial_days: number;

  // Step 4: Address / Slug
  slug: string;

  // Step 5: Admin Account
  admin_email: string;
  admin_name: string;
}
