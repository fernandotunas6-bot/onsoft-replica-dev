-- Continuacao de 20260924123000 / 140000 / 160000 / 170000. Destas oito que
-- faltavam com `FOR ALL` amplo, estas sao as duas onde a aplicacao **nunca**
-- escreve pelo cliente da sessao -- logo bastam `ALL → SELECT`, como nas sete
-- primeiras. As outras seis (`finance_payment_plans`, `rooms`,
-- `school_integrations`, `siga_access_cards`, `siga_lesson_plans`,
-- `siga_turnstile_devices`) sao escritas pela sessao e exigem, cada uma, a
-- analise que `staff_module_grants` exigiu: qual e a regra legitima.
--
-- `siga_access_logs` guarda quem passou na catraca, quando e em que sentido. Com
-- `ALL → is_school_member`, qualquer membro inseria, alterava ou apagava
-- registos de acesso -- e um registo de presenca fisica que se falsifica.
--
--   Escritas verificadas, todas com `service_role`:
--     · catracas/server.ts:482,555            sob `loadSgaAdminClient()`
--     · catracas/gate-pass-validation.ts:106  recebe `db` por parametro; os dois
--       chamadores (`catracas/server.ts:178`, `device-webhook-handler.ts:11`)
--       passam `loadSgaAdminClient()`
--
-- `siga_lesson_plan_components` tem menor alcance, mas a mesma forma. Todas as
-- seis ocorrencias em `lesson-plans/server.ts` correm sobre
-- `Db = Awaited<ReturnType<typeof loadSgaAdminClient>>` (:120,143,158,181) ou
-- `loadSgaAdminClient()` (:261,340).
--
-- A leitura nao e tocada, pela mesma razao das anteriores.
--
-- Idempotente. NAO foi aplicada -- e escrita na base, decisao do dono.
-- Depois de aplicar: `npm run siga:db-snapshot`.

BEGIN;

DROP POLICY IF EXISTS "Access logs in own school" ON public.siga_access_logs;
CREATE POLICY "Access logs in own school" ON public.siga_access_logs
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

DROP POLICY IF EXISTS "Manage lesson plan components in own school" ON public.siga_lesson_plan_components;
CREATE POLICY "Manage lesson plan components in own school" ON public.siga_lesson_plan_components
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

COMMIT;

NOTIFY pgrst, 'reload schema';
