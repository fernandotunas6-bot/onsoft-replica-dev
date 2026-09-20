-- Portfolio por nível de ensino: Primária, Médio e Superior.
-- Mantém os itens existentes válidos (education_level nullable) e permite
-- classificar cada evidência sem duplicar o perfil académico oficial.

alter table public.alumni_portfolio_items
  add column if not exists education_level text;

alter table public.alumni_portfolio_items
  drop constraint if exists alumni_portfolio_items_education_level_check;

alter table public.alumni_portfolio_items
  add constraint alumni_portfolio_items_education_level_check
  check (education_level is null or education_level in ('primary','middle','higher'));

create index if not exists idx_alumni_portfolio_level
  on public.alumni_portfolio_items(school_id, alumni_id, education_level, featured desc, sort_order asc);

comment on column public.alumni_portfolio_items.education_level is
  'Nível do percurso a que a evidência pertence: primary, middle ou higher. Null preserva itens legados ainda não classificados.';
