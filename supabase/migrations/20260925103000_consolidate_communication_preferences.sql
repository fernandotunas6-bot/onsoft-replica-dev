-- Consolida as preferências de comunicação numa só tabela e limpa o que sobrava.
--
-- Achado P2 da área 8 (docs/auditoria/08-auditoria.md, 8.2): existiam DUAS tabelas para a
-- mesma coisa.
--
--   · `notification_preferences` -- RLS activa e ZERO políticas, logo inalcançável pelo
--     cliente (falha fechado, nunca expôs nada); 0 linhas; e as colunas eram de
--     *notificação* (title, body, payload, status) com quatro booleanos de canal
--     pendurados. Confundia-se com a tabela `notifications`.
--   · `user_communication_preferences` -- RLS correcta (`auth_view_own_communication_prefs`),
--     categorias claras (financial / academic / attendance / documents / announcements /
--     calendar / events / marketing) e `channel_preferences`.
--
-- Sobrevive a segunda. A primeira é eliminada, e com ela
-- `public.upsert_notification_preferences`, que lhe escrevia e que nenhum ecrã chamava
-- (zero referências em `src/`).
--
-- `notify_permission_holders` deixa de excluir por `notification_preferences.in_app_enabled`
-- e passa a excluir por `user_communication_preferences`, mapeando o evento a uma
-- categoria pelo prefixo de `event_type`. Continua a escrever apenas avisos in-app em
-- `notifications` -- que é o que o portal lê.
--
-- NOTA sobre despacho externo (email/SMS/WhatsApp): chegou a ser construído nesta sessão e
-- foi revertido no mesmo dia, antes de ficar ligado. A razão, medida na produção a
-- 2026-09-25: 94 utilizadores activos todos com papel `owner` (zero encarregados, zero
-- alunos), ZERO com e-mail preenchido, dois com telemóvel, 16 notificações geradas desde
-- sempre e a última há 19 dias. Despacharia para ninguém, sobre quase nada -- e sem
-- mecanismo de recusa, porque `user_communication_preferences` tem política de leitura mas
-- nenhuma de escrita. A auditoria tinha posto essa ordem de propósito. Quando houver
-- contas de encarregado com contactos reais, a ponte volta a fazer sentido -- e a pergunta
-- de partida deve mudar: um encarregado interessa-se por um aviso pela relação com o
-- aluno, não por deter uma permissão, que é como esta função escolhe destinatários.

BEGIN;

DROP FUNCTION IF EXISTS public.upsert_notification_preferences(uuid, boolean, boolean, boolean, boolean);
DROP TABLE IF EXISTS public.notification_preferences;

CREATE OR REPLACE FUNCTION private.notify_permission_holders(
  target_school_id uuid,
  permission_code text,
  event_type text,
  title text,
  body text,
  payload jsonb DEFAULT '{}'::jsonb,
  exclude_user_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  inserted integer := 0;
  v_category text;
begin
  v_category := case
    when event_type like 'invoice%' then 'financial'
    when event_type like 'document%' then 'documents'
    when event_type like 'grade_sheet%' then 'academic'
    when event_type like 'attendance%' then 'attendance'
    else 'announcements'
  end;

  insert into public.notifications (
    school_id, user_id, channel, event_type, title, body, payload, status
  )
  select distinct
    target_school_id,
    m.user_id,
    'in_app',
    event_type,
    left(btrim(title), 160),
    left(btrim(body), 4000),
    coalesce(payload, '{}'::jsonb),
    'delivered'
  from public.school_memberships m
  join public.member_roles mr on mr.school_id = m.school_id and mr.membership_id = m.id
  join public.role_permissions rp on rp.school_id = mr.school_id and rp.role_id = mr.role_id
  join public.permissions p on p.id = rp.permission_id
  where m.school_id = target_school_id
    and m.status = 'active'
    and p.code = permission_code
    and (exclude_user_id is null or m.user_id <> exclude_user_id)
    and not exists (
      select 1 from public.user_communication_preferences ucp
      where ucp.school_id = m.school_id
        and ucp.user_id = m.user_id
        and (
          case v_category
            when 'financial' then not ucp.financial_enabled
            when 'documents' then not ucp.documents_enabled
            when 'academic' then not ucp.academic_enabled
            when 'attendance' then not ucp.attendance_enabled
            else not ucp.announcements_enabled
          end
        )
    );

  get diagnostics inserted = row_count;
  return inserted;
end;
$function$;

COMMENT ON FUNCTION private.notify_permission_holders(uuid, text, text, text, text, jsonb, uuid) IS
  'Cria avisos in-app em notifications, respeitando user_communication_preferences pela categoria do evento. Não despacha por email/SMS/WhatsApp -- ver o cabeçalho de 20260925100000.';

-- Limpeza defensiva: só faz alguma coisa na instância que chegou a ter o agendamento
-- (a produção, durante algumas horas a 2026-09-25). Numa base nova não há schema `cron`
-- e o bloco não corre.
DO $cleanup$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'dispatch-pending-notifications';
  END IF;
END
$cleanup$;

COMMIT;

NOTIFY pgrst, 'reload schema';
