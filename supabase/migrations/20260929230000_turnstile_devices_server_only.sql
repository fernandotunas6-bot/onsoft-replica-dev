-- Dispositivos das catracas: só o servidor.
--
-- `20260925190000_harden_member_wide_policies.sql` deixou a política
-- "Members read siga_turnstile_devices" com `is_school_member`, que é verdadeiro
-- para alunos e encarregados. A tabela guarda a `api_key` de cada leitor: com
-- ela regista-se entradas e saídas em `siga_access_logs` e vê-se o nome e a
-- foto do dono de um cartão.
--
-- Hoje a leitura não passa porque `authenticated` não tem SELECT na tabela
-- (retrato de 28/09: auth_select = false), mas bastava um GRANT para abrir as
-- chaves a qualquer aluno. Nenhum código do browser lê esta tabela: o servidor
-- usa a chave de serviço (`catracas/server.ts`, `gate-pass-validation.ts`,
-- `device-webhook-handler.ts`).
--
-- Idempotente. Não apaga dados.

DROP POLICY IF EXISTS "Members read siga_turnstile_devices" ON public.siga_turnstile_devices;
DROP POLICY IF EXISTS "Turnstile devices in own school" ON public.siga_turnstile_devices;
ALTER TABLE public.siga_turnstile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_turnstile_devices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_turnstile_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_turnstile_devices TO service_role;
