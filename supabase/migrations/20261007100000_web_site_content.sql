-- Conteúdo do site público (painel/web) gerido no ADMIN, e vitrine de escolas.
--
-- Quatro tabelas só do servidor (FORCE RLS, sem políticas, REVOKE a anon e
-- authenticated). O site lê pelas rotas públicas /api/saas/public/* (só o que está
-- publicado) e o ADMIN escreve pelas rotas /api/saas/site/*, que exigem administrador
-- da plataforma com 2FA (requirePlatformAdminFromRequest). A escola liga a vitrine no
-- SIGA, pelo servidor, com o papel de Administrador.
--
-- Idempotente: pode correr duas vezes. Nenhuma destas tabelas existia em produção
-- (supabase/PRODUCTION_SNAPSHOT.json).

-- 1. Artigos do blog --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Novidades',
  cover_url text,
  author_name text,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_blog_posts_slug_key UNIQUE (slug),
  CONSTRAINT web_blog_posts_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  CONSTRAINT web_blog_posts_title_check CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  CONSTRAINT web_blog_posts_excerpt_check CHECK (char_length(excerpt) <= 400),
  CONSTRAINT web_blog_posts_body_check CHECK (char_length(body) <= 60000),
  CONSTRAINT web_blog_posts_category_check CHECK (char_length(btrim(category)) BETWEEN 1 AND 60),
  CONSTRAINT web_blog_posts_cover_check CHECK (cover_url IS NULL OR cover_url ~ '^https://'),
  CONSTRAINT web_blog_posts_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT web_blog_posts_published_check CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS web_blog_posts_published_idx
  ON public.web_blog_posts (published_at DESC)
  WHERE status = 'published';

DROP TRIGGER IF EXISTS web_blog_posts_touch_updated_at ON public.web_blog_posts;
CREATE TRIGGER web_blog_posts_touch_updated_at
  BEFORE UPDATE ON public.web_blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.web_blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_blog_posts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_blog_posts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_blog_posts TO service_role;

-- 2. Perguntas frequentes ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL DEFAULT 'Geral',
  sort_order integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_faqs_question_check CHECK (char_length(btrim(question)) BETWEEN 3 AND 300),
  CONSTRAINT web_faqs_answer_check CHECK (char_length(btrim(answer)) BETWEEN 3 AND 4000),
  CONSTRAINT web_faqs_category_check CHECK (char_length(btrim(category)) BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS web_faqs_published_idx
  ON public.web_faqs (sort_order)
  WHERE is_published;

DROP TRIGGER IF EXISTS web_faqs_touch_updated_at ON public.web_faqs;
CREATE TRIGGER web_faqs_touch_updated_at
  BEFORE UPDATE ON public.web_faqs
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.web_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_faqs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_faqs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_faqs TO service_role;

-- As perguntas que o site já mostra, só se a tabela estiver vazia (correr outra vez não
-- duplica nem repõe o que o ADMIN apagou depois).
INSERT INTO public.web_faqs (question, answer, category, sort_order, featured)
SELECT v.question, v.answer, v.category, v.sort_order, v.featured
FROM (VALUES
    ($faq$Como crio a minha escola no SIGA Plus?$faq$, $faq$Clique em «Criar escola grátis» e siga seis passos curtos: dados da escola, responsável, plano, conta do administrador e endereço da escola (por exemplo, a-minha-escola.portal-siga.com). No fim, entra no SIGA, onde a equipa trabalha no dia-a-dia.$faq$, $faq$Geral$faq$, 10, true),
    ($faq$Há período de avaliação?$faq$, $faq$Sim: 14 dias para experimentar, sem compromisso. No fim escolhe o plano que serve a escola e continua com os mesmos dados.$faq$, $faq$Geral$faq$, 20, true),
    ($faq$Os dados da minha escola ficam separados das outras?$faq$, $faq$Sim. Cada escola vê só os seus dados, com acessos por cargo e verificação em dois passos (2FA) para quem trata de dinheiro e de notas.$faq$, $faq$Privacidade$faq$, 30, true),
    ($faq$Como recebemos as propinas?$faq$, $faq$A tesouraria emite facturas e recibos com o IBAN da escola. A cobrança por Multicaixa Express e Unitel Money é feita pelo PayFlow, ligado ao SIGA.$faq$, $faq$Facturação$faq$, 40, true),
    ($faq$Funciona sem Internet?$faq$, $faq$No navegador precisa de rede. Na app para computador (Windows, macOS e Linux), chamadas e notas lançadas sem rede ficam guardadas e seguem sozinhas quando a Internet volta.$faq$, $faq$Técnico$faq$, 50, true),
    ($faq$Como obtenho ajuda?$faq$, $faq$Os manuais em português estão sempre à mão, a partir do site e do SIGA. Para outras dúvidas, use o formulário de contacto nesta página.$faq$, $faq$Suporte$faq$, 60, true),
    ($faq$O que é o SIGA Plus?$faq$, $faq$O SIGA Plus é a plataforma de gestão escolar para instituições em Angola: matrículas, pautas, tesouraria, cobrança por Multicaixa Express e comunicação com as famílias, no navegador e na app para computador.$faq$, $faq$Geral$faq$, 70, false),
    ($faq$Como começo?$faq$, $faq$Crie a escola aqui no site («Criar escola»), escolha um plano e entre no SIGA para trabalhar no dia-a-dia. Os manuais em português ajudam em cada área.$faq$, $faq$Geral$faq$, 80, false),
    ($faq$Que navegadores são suportados?$faq$, $faq$Chrome e Edge 111+, Firefox 114+ e Safari 16.4+ (no iPhone e iPad, iOS 16.4+). No Mac, a app para computador usa o Safari do sistema: mantenha-o actualizado em Actualização de Software.$faq$, $faq$Geral$faq$, 90, false),
    ($faq$Como recupero a senha?$faq$, $faq$Na página de entrada, use Esqueceu a senha?, introduza o e-mail e siga o link que enviamos.$faq$, $faq$Conta$faq$, 100, false),
    ($faq$Posso alterar o e-mail da conta?$faq$, $faq$Sim, nas definições do utilizador. O novo endereço precisa de ser confirmado antes de passar a ser o principal.$faq$, $faq$Conta$faq$, 110, false),
    ($faq$Como elimino a conta?$faq$, $faq$Nas definições da conta, escolha Eliminar conta. Esta acção é irreversível e remove os dados da escola neste produto.$faq$, $faq$Conta$faq$, 120, false),
    ($faq$Que métodos de pagamento aceitam?$faq$, $faq$A subscrição do SIGA Plus paga-se pelos canais indicados no plano. Na escola, as propinas podem ser cobradas por Multicaixa Express, Unitel Money e transferência para o IBAN da escola.$faq$, $faq$Facturação$faq$, 130, false),
    ($faq$Como mudo de plano?$faq$, $faq$Na página de preços ou nas Definições da escola, no SIGA. A alteração aplica-se ao ciclo seguinte, salvo indicação em contrário.$faq$, $faq$Facturação$faq$, 140, false),
    ($faq$Como funciona a facturação?$faq$, $faq$O plano da escola é mensal ou anual, com recibos e histórico nas Definições da escola. As propinas dos alunos são outra coisa: tratam-se na tesouraria do SIGA.$faq$, $faq$Facturação$faq$, 150, false),
    ($faq$Há integrações?$faq$, $faq$Sim. Multicaixa Express, Unitel Money, Google Classroom, Moodle e WhatsApp configuram-se nas definições da escola, conforme o plano.$faq$, $faq$Técnico$faq$, 160, false),
    ($faq$Há manutenção programada?$faq$, $faq$Manutenções são anunciadas com antecedência. Fora desses intervalos o serviço deve permanecer disponível.$faq$, $faq$Técnico$faq$, 170, false),
    ($faq$Como tratam os dados pessoais?$faq$, $faq$Cada escola vê só os seus dados. Não partilhamos informação de alunos com terceiros sem base legal ou consentimento. Os detalhes estão na Política de Privacidade.$faq$, $faq$Privacidade$faq$, 180, false),
    ($faq$Os dados estão encriptados?$faq$, $faq$Sim. Toda a comunicação usa HTTPS, as palavras-passe nunca são guardadas em texto e os documentos sensíveis ficam em armazenamento com acesso controlado.$faq$, $faq$Privacidade$faq$, 190, false),
    ($faq$Há autenticação de dois factores?$faq$, $faq$Sim. O SIGA suporta verificação em dois passos (2FA) com uma app de autenticação, recomendada para a direcção e a tesouraria.$faq$, $faq$Segurança$faq$, 200, false)
) AS v (question, answer, category, sort_order, featured)
WHERE NOT EXISTS (SELECT 1 FROM public.web_faqs);

-- 3. Mensagens do formulário de contacto (dados pessoais: só o servidor) -----------
CREATE TABLE IF NOT EXISTS public.web_contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  school text,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_contact_messages_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT web_contact_messages_email_check CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 5 AND 254),
  CONSTRAINT web_contact_messages_school_check CHECK (school IS NULL OR char_length(school) <= 160),
  CONSTRAINT web_contact_messages_subject_check CHECK (char_length(btrim(subject)) BETWEEN 3 AND 160),
  CONSTRAINT web_contact_messages_message_check CHECK (char_length(btrim(message)) BETWEEN 10 AND 5000),
  CONSTRAINT web_contact_messages_status_check CHECK (status IN ('new', 'answered', 'archived'))
);

CREATE INDEX IF NOT EXISTS web_contact_messages_inbox_idx
  ON public.web_contact_messages (created_at DESC)
  WHERE status = 'new';

DROP TRIGGER IF EXISTS web_contact_messages_touch_updated_at ON public.web_contact_messages;
CREATE TRIGGER web_contact_messages_touch_updated_at
  BEFORE UPDATE ON public.web_contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.web_contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_contact_messages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_contact_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_contact_messages TO service_role;

-- 4. Vitrine: escolas que aceitam aparecer no site ---------------------------------
-- Só aparece com opted_in (decisão da escola, no SIGA) e sem hidden_by_platform (o
-- ADMIN pode esconder). O site mostra apenas nome, logótipo e cidade da escola.
CREATE TABLE IF NOT EXISTS public.web_school_showcase (
  school_id uuid PRIMARY KEY REFERENCES public.schools (id) ON DELETE CASCADE,
  opted_in boolean NOT NULL DEFAULT false,
  opted_in_at timestamptz,
  opted_in_by uuid,
  hidden_by_platform boolean NOT NULL DEFAULT false,
  hidden_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_school_showcase_reason_check CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 300)
);

DROP TRIGGER IF EXISTS web_school_showcase_touch_updated_at ON public.web_school_showcase;
CREATE TRIGGER web_school_showcase_touch_updated_at
  BEFORE UPDATE ON public.web_school_showcase
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.web_school_showcase ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_school_showcase FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_school_showcase FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_school_showcase TO service_role;
