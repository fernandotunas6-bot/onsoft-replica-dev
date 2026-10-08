/**
 * Conteúdo do site público (painel/web) no servidor: artigos do blog, perguntas
 * frequentes, mensagens de contacto, vitrine de escolas e números do sistema.
 *
 * Só com a chave de serviço: as tabelas `web_*` são fechadas a anon/authenticated
 * (FORCE RLS, sem políticas; migração 20261007100000). Quem chama decide a autorização:
 * as rotas públicas só lêem o que está publicado (e a vitrine só mostra nome, logótipo e
 * cidade de escolas que o aceitaram) ou gravam uma mensagem de contacto com limite por
 * IP; as rotas do ADMIN exigem administrador da plataforma (requirePlatformAdminFromRequest).
 */
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import {
  resolvePublishedAt,
  slugify,
  type BlogPostInput,
  type BlogStatus,
  type ContactMessageInput,
  type ContactStatus,
  type FaqInput,
} from "./web-site-schemas";

// Tabelas novas (20261007100000): lidas sem o tipo gerado, como as outras fora de types.ts.
type LooseDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = Record<string, unknown>;

async function db(): Promise<LooseDb> {
  return (await loadSgaAdminClient()) as unknown as LooseDb;
}

const str = (value: unknown) => (typeof value === "string" ? value : null);

// ---------------------------------------------------------------------------------
// Blog

export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  coverUrl: string | null;
  authorName: string | null;
  publishedAt: string | null;
};
export type BlogPost = BlogPostSummary & { body: string };
export type BlogPostAdmin = BlogPost & { status: BlogStatus; updatedAt: string };

const SUMMARY_COLUMNS = "id, slug, title, excerpt, category, cover_url, author_name, published_at";

function toSummary(r: Row): BlogPostSummary {
  return {
    id: String(r["id"]),
    slug: String(r["slug"]),
    title: String(r["title"]),
    excerpt: String(r["excerpt"] ?? ""),
    category: String(r["category"] ?? "Novidades"),
    coverUrl: str(r["cover_url"]),
    authorName: str(r["author_name"]),
    publishedAt: str(r["published_at"]),
  };
}

export async function listPublishedPosts(limit = 50): Promise<BlogPostSummary[]> {
  const { data, error } = await (
    await db()
  )
    .from("web_blog_posts")
    .select(SUMMARY_COLUMNS)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error("Não foi possível ler os artigos.");
  return ((data ?? []) as Row[]).map(toSummary);
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const { data, error } = await (
    await db()
  )
    .from("web_blog_posts")
    .select(`${SUMMARY_COLUMNS}, body`)
    .eq("status", "published")
    .eq("slug", slug)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler o artigo.");
  if (!data) return null;
  return { ...toSummary(data as Row), body: String((data as Row)["body"] ?? "") };
}

export async function listAllPosts(): Promise<BlogPostAdmin[]> {
  const { data, error } = await (
    await db()
  )
    .from("web_blog_posts")
    .select(`${SUMMARY_COLUMNS}, body, status, updated_at`)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Não foi possível ler os artigos.");
  return ((data ?? []) as Row[]).map((r) => ({
    ...toSummary(r),
    body: String(r["body"] ?? ""),
    status: String(r["status"]) as BlogStatus,
    updatedAt: String(r["updated_at"]),
  }));
}

export async function savePost(input: BlogPostInput, actorUserId: string): Promise<{ id: string }> {
  const client = await db();
  const slug = input.slug || slugify(input.title);
  if (!slug) throw new Error("Escreva um título com letras ou números.");
  let currentPublishedAt: string | null = null;
  if (input.id) {
    const { data } = await client
      .from("web_blog_posts")
      .select("published_at")
      .eq("id", input.id)
      .maybeSingle();
    if (!data) throw new Error("Artigo não encontrado.");
    currentPublishedAt = str((data as Row)["published_at"]);
  }
  const row = {
    slug,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    category: input.category,
    cover_url: input.coverUrl ?? null,
    author_name: input.authorName || null,
    status: input.status,
    published_at: resolvePublishedAt(input.status, currentPublishedAt),
    updated_by: actorUserId,
  };
  const query = input.id
    ? client.from("web_blog_posts").update(row).eq("id", input.id)
    : client.from("web_blog_posts").insert({ ...row, created_by: actorUserId });
  const { data, error } = await query.select("id").single();
  if (error) {
    if (String(error.code) === "23505") throw new Error("Já existe um artigo com este endereço.");
    throw new Error("Não foi possível guardar o artigo.");
  }
  return { id: String((data as Row)["id"]) };
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await (await db()).from("web_blog_posts").delete().eq("id", id);
  if (error) throw new Error("Não foi possível apagar o artigo.");
}

// ---------------------------------------------------------------------------------
// Perguntas frequentes

export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  featured: boolean;
};
export type FaqAdmin = Faq & { sortOrder: number; isPublished: boolean };

function toFaqAdmin(r: Row): FaqAdmin {
  return {
    id: String(r["id"]),
    question: String(r["question"]),
    answer: String(r["answer"]),
    category: String(r["category"] ?? "Geral"),
    featured: Boolean(r["featured"]),
    sortOrder: Number(r["sort_order"] ?? 0),
    isPublished: Boolean(r["is_published"]),
  };
}

const FAQ_COLUMNS = "id, question, answer, category, featured, sort_order, is_published";

export async function listPublishedFaqs(): Promise<Faq[]> {
  const { data, error } = await (
    await db()
  )
    .from("web_faqs")
    .select(FAQ_COLUMNS)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .limit(200);
  if (error) throw new Error("Não foi possível ler as perguntas.");
  return ((data ?? []) as Row[]).map((r) => {
    const { id, question, answer, category, featured } = toFaqAdmin(r);
    return { id, question, answer, category, featured };
  });
}

export async function listAllFaqs(): Promise<FaqAdmin[]> {
  const { data, error } = await (
    await db()
  )
    .from("web_faqs")
    .select(FAQ_COLUMNS)
    .order("sort_order", { ascending: true })
    .limit(500);
  if (error) throw new Error("Não foi possível ler as perguntas.");
  return ((data ?? []) as Row[]).map(toFaqAdmin);
}

export async function saveFaq(input: FaqInput, actorUserId: string): Promise<{ id: string }> {
  const client = await db();
  const row = {
    question: input.question,
    answer: input.answer,
    category: input.category,
    sort_order: input.sortOrder,
    featured: input.featured,
    is_published: input.isPublished,
    updated_by: actorUserId,
  };
  const query = input.id
    ? client.from("web_faqs").update(row).eq("id", input.id)
    : client.from("web_faqs").insert({ ...row, created_by: actorUserId });
  const { data, error } = await query.select("id").single();
  if (error) throw new Error("Não foi possível guardar a pergunta.");
  return { id: String((data as Row)["id"]) };
}

export async function deleteFaq(id: string): Promise<void> {
  const { error } = await (await db()).from("web_faqs").delete().eq("id", id);
  if (error) throw new Error("Não foi possível apagar a pergunta.");
}

// ---------------------------------------------------------------------------------
// Contacto

/** Por IP: 5 mensagens por hora e 20 por dia chegam para uma escola a sério. */
const CONTACT_LIMITS = [
  { windowMs: 3_600_000, max: 5 },
  { windowMs: 86_400_000, max: 20 },
] as const;

export type ContactResult = { ok: true } | { ok: false; status: 429; error: string };

export async function submitContactMessage(
  input: ContactMessageInput,
  ip: string,
): Promise<ContactResult> {
  // Campo escondido preenchido: um robô. Responde como se tivesse corrido bem.
  if (input.website) return { ok: true };
  for (const limit of CONTACT_LIMITS) {
    if (!(await consumeRateLimit([`web_contact:${limit.windowMs}:${ip}`], limit))) {
      return {
        ok: false,
        status: 429,
        error:
          "Recebemos muitas mensagens deste endereço. Tente mais tarde ou escreva-nos por e-mail.",
      };
    }
  }
  const { error } = await (await db()).from("web_contact_messages").insert({
    name: input.name,
    email: input.email,
    school: input.school || null,
    subject: input.subject,
    message: input.message,
  });
  if (error) throw new Error("Não foi possível guardar a mensagem.");
  return { ok: true };
}

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  school: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  handledAt: string | null;
  createdAt: string;
};

export async function listContactMessages(status?: ContactStatus): Promise<ContactMessage[]> {
  let query = (await db())
    .from("web_contact_messages")
    .select("id, name, email, school, subject, message, status, handled_at, created_at");
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("Não foi possível ler as mensagens.");
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    email: String(r["email"]),
    school: str(r["school"]),
    subject: String(r["subject"]),
    message: String(r["message"]),
    status: String(r["status"]) as ContactStatus,
    handledAt: str(r["handled_at"]),
    createdAt: String(r["created_at"]),
  }));
}

export async function setContactStatus(
  id: string,
  status: ContactStatus,
  actorUserId: string,
): Promise<void> {
  const handled =
    status === "new"
      ? { handled_by: null, handled_at: null }
      : {
          handled_by: actorUserId,
          handled_at: new Date().toISOString(),
        };
  const { error } = await (
    await db()
  )
    .from("web_contact_messages")
    .update({ status, ...handled })
    .eq("id", id);
  if (error) throw new Error("Não foi possível actualizar a mensagem.");
}

// ---------------------------------------------------------------------------------
// Vitrine de escolas

export type ShowcaseSchool = {
  id: string;
  name: string;
  logoUrl: string | null;
  city: string | null;
};

export type ShowcaseAdminRow = ShowcaseSchool & {
  status: string;
  optedIn: boolean;
  optedInAt: string | null;
  hidden: boolean;
  hiddenReason: string | null;
};

/** Nome comercial (ou oficial), logótipo e cidade: o que a escola já mostra ao público. */
function publicSchool(r: Row): ShowcaseSchool {
  const school = (r["schools"] ?? r) as Row;
  const name = str(school["commercial_name"])?.trim() || String(school["name"] ?? "");
  return {
    id: String(school["id"] ?? r["school_id"]),
    name,
    logoUrl: str(school["logo_url"]),
    city: str(school["city"]) || str(school["province"]),
  };
}

export async function listShowcaseSchools(): Promise<ShowcaseSchool[]> {
  const { data, error } = await (
    await db()
  )
    .from("web_school_showcase")
    .select(
      "school_id, opted_in_at, schools!inner(id, name, commercial_name, logo_url, city, province, status)",
    )
    .eq("opted_in", true)
    .eq("hidden_by_platform", false)
    .eq("schools.status", "active")
    .order("opted_in_at", { ascending: true })
    .limit(200);
  if (error) throw new Error("Não foi possível ler as escolas.");
  return ((data ?? []) as Row[]).map(publicSchool).filter((s) => s.name);
}

export async function listShowcaseAdmin(): Promise<ShowcaseAdminRow[]> {
  const client = await db();
  const [{ data: schools, error }, { data: choices }] = await Promise.all([
    client
      .from("schools")
      .select("id, name, commercial_name, logo_url, city, province, status")
      .order("name", { ascending: true })
      .limit(2000),
    client
      .from("web_school_showcase")
      .select("school_id, opted_in, opted_in_at, hidden_by_platform, hidden_reason")
      .limit(2000),
  ]);
  if (error) throw new Error("Não foi possível ler as escolas.");
  const bySchool = new Map(((choices ?? []) as Row[]).map((c) => [String(c["school_id"]), c]));
  return ((schools ?? []) as Row[]).map((s) => {
    const choice = bySchool.get(String(s["id"]));
    return {
      ...publicSchool(s),
      status: String(s["status"]),
      optedIn: Boolean(choice?.["opted_in"]),
      optedInAt: str(choice?.["opted_in_at"]),
      hidden: Boolean(choice?.["hidden_by_platform"]),
      hiddenReason: str(choice?.["hidden_reason"]),
    };
  });
}

export async function setShowcaseHidden(
  schoolId: string,
  hidden: boolean,
  reason: string | null | undefined,
): Promise<void> {
  const { error } = await (await db()).from("web_school_showcase").upsert(
    {
      school_id: schoolId,
      hidden_by_platform: hidden,
      hidden_reason: hidden ? reason || null : null,
    },
    { onConflict: "school_id" },
  );
  if (error) throw new Error("Não foi possível actualizar a escola.");
}

export async function getShowcaseChoice(
  schoolId: string,
): Promise<{ optedIn: boolean; hidden: boolean }> {
  const { data } = await (
    await db()
  )
    .from("web_school_showcase")
    .select("opted_in, hidden_by_platform")
    .eq("school_id", schoolId)
    .maybeSingle();
  return {
    optedIn: Boolean((data as Row | null)?.["opted_in"]),
    hidden: Boolean((data as Row | null)?.["hidden_by_platform"]),
  };
}

export async function setShowcaseOptIn(
  schoolId: string,
  optedIn: boolean,
  actorUserId: string,
): Promise<void> {
  const { error } = await (await db()).from("web_school_showcase").upsert(
    {
      school_id: schoolId,
      opted_in: optedIn,
      opted_in_at: optedIn ? new Date().toISOString() : null,
      opted_in_by: optedIn ? actorUserId : null,
    },
    { onConflict: "school_id" },
  );
  if (error) throw new Error("Não foi possível guardar a escolha.");
}

// ---------------------------------------------------------------------------------
// Números do sistema (só totais, nada pessoal)

export type PublicStats = { schools: number; students: number };

export async function fetchPublicStats(): Promise<PublicStats> {
  const client = await db();
  const [schools, students] = await Promise.all([
    client.from("schools").select("id", { count: "exact", head: true }).eq("status", "active"),
    client
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),
  ]);
  if (schools.error || students.error) throw new Error("Não foi possível ler os números.");
  return { schools: Number(schools.count ?? 0), students: Number(students.count ?? 0) };
}
