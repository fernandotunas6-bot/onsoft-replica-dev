-- Alumni Portfolio
-- Professional evidence linked to the canonical alumni/student/person identity.
-- Official school documents remain in document_requests/document_templates and are only referenced here.

create table if not exists public.alumni_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  alumni_id uuid not null references public.alumni_profiles(id) on delete cascade,
  item_type text not null check (item_type in ('project','publication','award','certificate','media','link','case_study','other')),
  title text not null,
  summary text,
  organization text,
  role text,
  started_on date,
  ended_on date,
  external_url text,
  image_url text,
  official_document_request_id uuid references public.document_requests(id) on delete set null,
  skills text[] not null default '{}',
  tags text[] not null default '{}',
  featured boolean not null default false,
  visibility text not null default 'alumni' check (visibility in ('private','school','alumni')),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index if not exists idx_alumni_portfolio_school_alumni on public.alumni_portfolio_items(school_id, alumni_id, sort_order, created_at desc);
create index if not exists idx_alumni_portfolio_featured on public.alumni_portfolio_items(school_id, alumni_id, featured) where featured = true;
create index if not exists idx_alumni_portfolio_type on public.alumni_portfolio_items(school_id, item_type);

alter table public.alumni_portfolio_items enable row level security;

comment on table public.alumni_portfolio_items is 'Portfólio profissional do Alumni: projectos, publicações, prémios, certificados externos, media e links. Documentos oficiais do SIGA são referenciados, não duplicados.';
comment on column public.alumni_portfolio_items.official_document_request_id is 'Referência opcional a document_requests quando o item corresponde a um documento oficial da escola.';
