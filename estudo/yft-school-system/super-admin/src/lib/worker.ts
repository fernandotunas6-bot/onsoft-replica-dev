import 'server-only';

type WorkerInit = RequestInit & {
  headers?: HeadersInit;
};

function getWorkerBaseUrl() {
  const baseUrl = process.env.WORKER_API_URL ?? process.env.NEXT_PUBLIC_WORKER_API_URL;
  if (!baseUrl) {
    throw new Error('WORKER_API_URL is not configured');
  }

  return baseUrl.replace(/\/$/, '');
}

function getSuperAdminKey() {
  const key = process.env.SUPER_ADMIN_API_KEY;
  if (!key) {
    throw new Error('SUPER_ADMIN_API_KEY is not configured');
  }

  return key;
}

export async function callWorker<T>(path: string, init: WorkerInit = {}) {
  const response = await fetch(`${getWorkerBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Super-Admin-Key': getSuperAdminKey(),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data
      ? String((data as { error?: string }).error ?? response.statusText)
      : response.statusText;
    throw new Error(message);
  }

  return data as T;
}

export type WorkerMetrics = {
  total_schools: number;
  active_schools: number;
  suspended_schools: number;
  total_revenue: number;
  system_distribution: Array<{ name: string; value: number }>;
  historical_trends: Array<{ label: string; schools: number; revenue: number }>;
};

export type SchoolSummary = {
  id: string;
  name: string;
  location: string | null;
  logo_url: string | null;
  motto: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  term_system: number;
  current_term_id: string | null;
  is_active: boolean;
  student_id_prefix: string;
  teacher_id_prefix: string;
  created_at: string;
  student_count: number;
  user_count: number;
};

export type SchoolAdmin = {
  uid: string;
  name: string;
  phone: string;
  email: string;
  created_at: string;
};

export type SchoolDetail = {
  id: string;
  name: string;
  location: string | null;
  logo_url: string | null;
  motto: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  term_system: number;
  current_term_id: string | null;
  is_active: boolean;
  student_id_prefix: string;
  teacher_id_prefix: string;
  created_at: string;
  admin: SchoolAdmin | null;
};

export async function fetchMetrics() {
  return callWorker<WorkerMetrics>('/api/super-admin/metrics');
}

export async function fetchSchools() {
  const response = await callWorker<{ data: SchoolSummary[] }>('/api/super-admin/schools');
  return response.data;
}

export async function fetchSchool(schoolId: string) {
  const response = await callWorker<{ data: SchoolDetail }>(`/api/super-admin/schools/${schoolId}`);
  return response.data;
}

export async function uploadSchoolLogo(file: File) {
  const formData = new FormData();
  formData.append('logo', file);

  const baseUrl = getWorkerBaseUrl();
  const response = await fetch(`${baseUrl}/api/super-admin/upload-logo`, {
    method: 'POST',
    headers: {
      'X-Super-Admin-Key': getSuperAdminKey(),
    },
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data
      ? String((data as { error?: string }).error ?? response.statusText)
      : response.statusText;
    throw new Error(message);
  }

  return data as { key: string; content_type: string };
}

export async function onboardSchool(payload: {
  school: {
    name: string;
    location?: string | null;
    term_system: number;
    logo_url?: string | null;
    motto?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    default_password?: string;
    student_id_prefix?: string;
    teacher_id_prefix?: string;
  };
  admin: {
    name: string;
    phone: string;
    email: string;
  };
}) {
  return callWorker<{
    school: {
      id: string;
      name: string;
      location: string | null;
      term_system: number;
      logo_url: string | null;
      student_id_prefix: string;
      teacher_id_prefix: string;
    };
    admin: {
      uid: string;
      email: string;
      temp_password: string;
    };
  }>('/api/super-admin/onboard-school', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSchool(schoolId: string, payload: {
  name?: string;
  location?: string | null;
  term_system?: number;
  logo_url?: string | null;
  motto?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  default_password?: string;
  student_id_prefix?: string;
  teacher_id_prefix?: string;
}) {
  return callWorker<{ data: SchoolDetail }>(`/api/super-admin/schools/${schoolId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteSchool(schoolId: string) {
  return callWorker<{ deleted: boolean; school_id: string }>(`/api/super-admin/schools/${schoolId}`, {
    method: 'DELETE',
  });
}

export async function updateSchoolAdmin(schoolId: string, payload: {
  name?: string;
  phone?: string;
  email?: string;
}) {
  return callWorker<{ data: SchoolAdmin }>(`/api/super-admin/schools/${schoolId}/admin`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateSchoolStatus(schoolId: string, is_active: boolean) {
  return callWorker<{ school_id: string; is_active: boolean }>(`/api/super-admin/schools/${schoolId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active }),
  });
}
