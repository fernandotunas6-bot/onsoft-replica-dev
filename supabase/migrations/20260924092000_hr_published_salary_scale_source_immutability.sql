-- The official source and classification of a published salary scale are
-- part of the audit trail. Revisions require a new scale rather than rewriting
-- the legal provenance of contracts that already reference the old one.
create or replace function public.hr_guard_published_salary_scale()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists (
   select 1 from public.hr_salary_scale_versions v
   where v.scale_id=old.id and v.status in ('approved','retired')
 ) then
   if tg_op='DELETE' then
     raise exception 'Tabela salarial com versões publicadas não pode ser eliminada'
       using errcode='23514';
   end if;
   if (old.code,old.name,old.jurisdiction,old.sector,
       old.source_title,old.source_reference,old.source_url)
      is distinct from
      (new.code,new.name,new.jurisdiction,new.sector,
       new.source_title,new.source_reference,new.source_url) then
     raise exception 'Fonte e identificação de tabela salarial publicada são imutáveis; crie uma nova tabela'
       using errcode='23514';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists hr_published_salary_scale_guard on public.hr_salary_scales;
create trigger hr_published_salary_scale_guard
before update or delete on public.hr_salary_scales
for each row execute function public.hr_guard_published_salary_scale();
revoke all on function public.hr_guard_published_salary_scale() from public,anon,authenticated;
