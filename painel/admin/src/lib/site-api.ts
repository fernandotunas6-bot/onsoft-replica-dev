/**
 * Site público (painel/web) gerido no ADMIN: artigos do blog, perguntas frequentes,
 * mensagens de contacto e vitrine de escolas. Fala com as rotas /api/saas/site/* do
 * SIGA, que exigem administrador da plataforma com 2FA (Bearer da sessão).
 */
import { getSaasApiUrl } from "@/lib/ecosystem-urls"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

export type BlogStatus = "draft" | "published" | "archived"
export type ContactStatus = "new" | "answered" | "archived"

export type BlogPostRow = {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  category: string
  coverUrl: string | null
  authorName: string | null
  publishedAt: string | null
  status: BlogStatus
  updatedAt: string
}

export type BlogPostDraft = {
  id?: string
  slug?: string
  title: string
  excerpt: string
  body: string
  category: string
  coverUrl: string
  authorName: string
  status: BlogStatus
}

export type FaqRow = {
  id: string
  question: string
  answer: string
  category: string
  featured: boolean
  sortOrder: number
  isPublished: boolean
}

export type FaqDraft = Omit<FaqRow, "id"> & { id?: string }

export type ContactMessageRow = {
  id: string
  name: string
  email: string
  school: string | null
  subject: string
  message: string
  status: ContactStatus
  handledAt: string | null
  createdAt: string
}

export type ShowcaseRow = {
  id: string
  name: string
  logoUrl: string | null
  city: string | null
  status: string
  optedIn: boolean
  optedInAt: string | null
  hidden: boolean
  hiddenReason: string | null
}

export type SiteResult<T> = { ok: true; data: T } | { ok: false; error: string; needsAuth: boolean }

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token
}

async function call<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<SiteResult<T>> {
  const token = await accessToken()
  if (!token) return { ok: false, error: "Sessão em falta.", needsAuth: true }
  let res: Response
  try {
    res = await fetch(getSaasApiUrl(path), {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    return { ok: false, error: "Serviço temporariamente indisponível. Tente novamente.", needsAuth: false }
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    return { ok: false, error: data.error || "Pedido recusado.", needsAuth: res.status === 401 }
  }
  return { ok: true, data }
}

export const siteApi = {
  posts: () => call<{ posts: BlogPostRow[] }>("/api/saas/site/posts"),
  savePost: (post: BlogPostDraft) =>
    call<{ id: string }>("/api/saas/site/posts", { method: "POST", body: { action: "save", post } }),
  deletePost: (id: string) =>
    call<{ ok: true }>("/api/saas/site/posts", { method: "POST", body: { action: "delete", id } }),

  faqs: () => call<{ faqs: FaqRow[] }>("/api/saas/site/faqs"),
  saveFaq: (faq: FaqDraft) =>
    call<{ id: string }>("/api/saas/site/faqs", { method: "POST", body: { action: "save", faq } }),
  deleteFaq: (id: string) =>
    call<{ ok: true }>("/api/saas/site/faqs", { method: "POST", body: { action: "delete", id } }),

  messages: (status?: ContactStatus) =>
    call<{ messages: ContactMessageRow[] }>(
      `/api/saas/site/messages${status ? `?status=${status}` : ""}`,
    ),
  setMessageStatus: (id: string, status: ContactStatus) =>
    call<{ ok: true }>("/api/saas/site/messages", { method: "POST", body: { id, status } }),

  showcase: () => call<{ schools: ShowcaseRow[] }>("/api/saas/site/showcase"),
  setShowcaseHidden: (schoolId: string, hidden: boolean, reason?: string) =>
    call<{ ok: true }>("/api/saas/site/showcase", {
      method: "POST",
      body: { schoolId, hidden, reason: reason || null },
    }),
}

export function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("pt-AO", { dateStyle: "medium", timeStyle: "short" })
}
