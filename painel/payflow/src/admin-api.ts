import type { Session } from "@supabase/supabase-js";

const apiBase = (import.meta.env.VITE_PAYFLOW_API_BASE || "").replace(/\/$/, "");
const SCHOOL_STORAGE_KEY = "siga:payflow:school-id";

export function getPreferredSchoolId() {
  return localStorage.getItem(SCHOOL_STORAGE_KEY);
}

export function setPreferredSchoolId(schoolId: string | null) {
  if (schoolId) localStorage.setItem(SCHOOL_STORAGE_KEY, schoolId);
  else localStorage.removeItem(SCHOOL_STORAGE_KEY);
}

async function request<T>(
  session: Session,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + session.access_token);
  headers.set("Accept", "application/json");
  const schoolId = getPreferredSchoolId();
  if (schoolId) headers.set("X-SIGA-School-ID", schoolId);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiBase + path, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}

export type PayflowOverview = {
  checkouts: number;
  pending: number;
  transactions: number;
  reconciliationQueue: number;
  refundsOpen: number;
  settledAmount: number;
  currency: string;
};

export async function fetchOverview(session: Session) {
  return request<PayflowOverview>(session, "/api/payflow/admin/overview");
}

export async function fetchResource<T = Record<string, unknown>>(
  session: Session,
  resource: string,
  limit = 100,
) {
  return request<{ rows: T[] }>(
    session,
    "/api/payflow/admin/data?resource=" + encodeURIComponent(resource) + "&limit=" + limit,
  );
}

export async function runAction<T = Record<string, unknown>>(
  session: Session,
  action: string,
  payload: Record<string, unknown>,
) {
  return request<T>(session, "/api/payflow/admin/actions", {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
}
