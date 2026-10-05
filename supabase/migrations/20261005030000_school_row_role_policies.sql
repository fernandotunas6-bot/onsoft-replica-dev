-- Papel pela escola da linha em duas políticas que ainda usavam o perfil global
-- (auditoria 12, A9; DATABASE_RULES.md regra 6d). Idempotente.
--
-- 1) finance_gateway_webhook_events — "Read gateway webhook events in own school" aceitava
--    `current_profile_role()` (papel da escola activa, não da linha) OU `profiles.cargo` em
--    ('Administrador','Tesouraria'), que é o cargo GLOBAL da pessoa. Com isso, um Administrador
--    da escola A que fosse apenas membro da escola B (encarregado, por exemplo) lia os eventos
--    de pagamento da escola B. Passa a exigir o papel nessa mesma escola. O código lê esta
--    tabela só com o cliente de serviço (finance/server.ts, gateway-webhook-handler.ts,
--    platform-ops.ts), por isso nada no SIGA muda; fecha-se a leitura directa pela API.
--
-- 2) schools — "Administrators can update their own school" comparava `current_profile_role()`
--    (devolve o código do papel: owner, admin, treasury…) com 'Administrador'. Nenhum código de
--    papel na produção é 'Administrador' (consultado a 04/10: owner, admin, secretary, treasury,
--    teacher, guardian, student, user), por isso a política nunca deu acesso. O servidor
--    actualiza a escola com o cliente de serviço (school/server.ts, updateSchoolSettings).
--    Retira-se a política em vez de a "reparar", para não abrir uma escrita directa nova.

DROP POLICY IF EXISTS "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events;
CREATE POLICY "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events
  FOR SELECT TO authenticated
  USING (
    (school_id IS NOT NULL)
    AND (school_id IN (SELECT private.user_member_school_ids()))
    AND (private.sga_app_role(school_id) = ANY (ARRAY['Administrador'::text, 'Tesouraria'::text]))
  );

DROP POLICY IF EXISTS "Administrators can update their own school" ON public.schools;
