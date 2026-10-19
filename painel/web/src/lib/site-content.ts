/**
 * Conteúdo do site gerido no ADMIN e servido pelo SIGA (/api/saas/public/*): perguntas
 * frequentes, escolas que aceitaram aparecer, números do sistema e artigos do blog.
 * Uma só chamada por visita (partilhada pelas secções); se o SIGA não responder, cada
 * secção usa o texto fixo do site.
 */
import { useEffect, useState } from "react"
import { getSaasApiUrl } from "@/lib/ecosystem-urls"

export type SiteFaq = {
  id: string
  question: string
  answer: string
  category: string
  featured: boolean
}

export type ShowcaseSchool = { id: string; name: string; logoUrl: string | null; city: string | null }

export type SiteStats = { schools: number; students: number }

export type BlogPostSummary = {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string
  coverUrl: string | null
  authorName: string | null
  publishedAt: string | null
}

export type BlogPost = BlogPostSummary & { body: string }

/** `null` numa parte = o SIGA não a conseguiu ler (usar o texto fixo). */
export type SiteContent = {
  faqs: SiteFaq[] | null
  showcase: ShowcaseSchool[] | null
  stats: SiteStats | null
  posts: BlogPostSummary[] | null
}

const EMPTY: SiteContent = { faqs: null, showcase: null, stats: null, posts: null }

let pending: Promise<SiteContent> | null = null

export function fetchSiteContent(): Promise<SiteContent> {
  pending ??= fetch(getSaasApiUrl("/api/saas/public/site"))
    .then(async (res) => (res.ok ? ({ ...EMPTY, ...(await res.json()) } as SiteContent) : EMPTY))
    .catch(() => {
      pending = null // tentar de novo na próxima página
      return EMPTY
    })
  return pending
}

/** `undefined` enquanto carrega. */
export function useSiteContent(): SiteContent | undefined {
  const [content, setContent] = useState<SiteContent>()
  useEffect(() => {
    let active = true
    void fetchSiteContent().then((value) => active && setContent(value))
    return () => {
      active = false
    }
  }, [])
  return content
}

export async function fetchBlogPosts(): Promise<BlogPostSummary[] | null> {
  try {
    const res = await fetch(getSaasApiUrl("/api/saas/public/blog"))
    if (!res.ok) return null
    return ((await res.json()) as { posts?: BlogPostSummary[] }).posts ?? []
  } catch {
    return null
  }
}

/** `undefined` = não existe; `null` = não foi possível ler agora. */
export async function fetchBlogPost(slug: string): Promise<BlogPost | null | undefined> {
  try {
    const res = await fetch(getSaasApiUrl(`/api/saas/public/blog?slug=${encodeURIComponent(slug)}`))
    if (res.status === 404) return undefined
    if (!res.ok) return null
    return ((await res.json()) as { post?: BlogPost }).post ?? undefined
  } catch {
    return null
  }
}

export type ContactPayload = {
  name: string
  email: string
  school?: string
  subject: string
  message: string
  website?: string
}

export type ContactOutcome = { ok: true } | { ok: false; error: string; retryByEmail: boolean }

export async function sendContactMessage(payload: ContactPayload): Promise<ContactOutcome> {
  try {
    const res = await fetch(getSaasApiUrl("/api/saas/public/contact"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) return { ok: true }
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return {
      ok: false,
      error: data.error || "Não foi possível enviar a mensagem.",
      retryByEmail: res.status >= 500 || res.status === 429,
    }
  } catch {
    return { ok: false, error: "Sem ligação ao SIGA Plus.", retryByEmail: true }
  }
}

const DATE = new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" })

export function formatPostDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : DATE.format(date)
}

/** 1234 → «1 234» (espaço fino como em pt-AO). */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("pt-PT").format(value)
}
