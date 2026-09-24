-- Freshness checks include soft-deleted events, unlike the calculation indexes.
create index if not exists hr_compensation_events_freshness_idx
on public.hr_compensation_events(school_id,employment_id,event_date,updated_at);
create index if not exists hr_absence_events_freshness_idx
on public.hr_absence_events(school_id,employment_id,absence_date,updated_at);
