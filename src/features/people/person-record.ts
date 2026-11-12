export type PersonRecord = {
  id: string;
  school_id?: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  photo_url?: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
  birth_date?: string | null;
  national_id?: string | null;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_primary?: string | null;
  province?: string | null;
  municipality?: string | null;
  commune?: string | null;
  address?: string | null;
  status?: string | null;
  roles?: string[];
  documents?: Array<{
    id: string;
    document_type: string;
    document_number: string;
    issued_at?: string | null;
    expires_at?: string | null;
  }>;
  academic_summary?: {
    total_enrollments: number;
    active_enrollment: {
      id: string;
      school_class_id: string | null;
      class_name: string | null;
      course_name: string | null;
      academic_year_name: string | null;
      status: string;
    } | null;
  };
  financial_summary?: {
    balance: number;
    overdue_count: number;
    currency: string;
  };
  has_contact_email?: boolean;
  created_at?: string;
};
