-- private.fanout_announcement_notifications: sem notification_preferences.
--
-- A tabela public.notification_preferences já não existe na produção
-- (verificado a 2026-09-28), mas esta função ainda a consultava; como é
-- plpgsql, o erro só aparece ao correr: public.publish_announcement falhava
-- sempre. Igual à definição da produção, sem esse filtro (todos os membros
-- abrangidos recebem a notificação na aplicação, que era o caso por omissão).
CREATE OR REPLACE FUNCTION private.fanout_announcement_notifications(target_school_id uuid, target_announcement_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ann public.announcements%rowtype;
  inserted integer := 0;
begin
  select * into ann
  from public.announcements
  where school_id = target_school_id and id = target_announcement_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Anúncio não encontrado.';
  end if;
  if ann.status <> 'published' then
    raise exception using errcode = '22023', message = 'Só anúncios publicados geram notificações.';
  end if;

  insert into public.notifications (
    school_id, user_id, channel, event_type, title, body, payload, announcement_id, status
  )
  select
    target_school_id,
    m.user_id,
    'in_app',
    'announcement.published',
    ann.title,
    left(ann.body, 4000),
    jsonb_build_object(
      'announcementId', ann.id,
      'audience', ann.audience,
      'priority', ann.priority,
      'classGroupId', ann.class_group_id,
      'roleCode', ann.role_code
    ),
    ann.id,
    'delivered'
  from public.school_memberships m
  where m.school_id = target_school_id
    and m.status = 'active'
    and (
      ann.audience = 'school'
      or ann.audience = 'class_group'
      or (
        ann.audience = 'role'
        and exists (
          select 1
          from public.member_roles mr
          join public.roles r on r.school_id = mr.school_id and r.id = mr.role_id
          where mr.school_id = m.school_id
            and mr.membership_id = m.id
            and r.code = ann.role_code
        )
      )
    )
    and not exists (
      select 1 from public.notifications n
      where n.school_id = target_school_id
        and n.user_id = m.user_id
        and n.announcement_id = ann.id
        and n.channel = 'in_app'
    );

  get diagnostics inserted = row_count;
  return inserted;
end;
$function$;
