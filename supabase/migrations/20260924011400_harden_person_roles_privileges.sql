-- person_roles contains institutional role assignments and must remain read-only
-- for authenticated clients. Importação de funcionários usa hr_employments/hr_positions.
revoke all on public.person_roles from anon, authenticated;
grant select on public.person_roles to authenticated;
