-- Voltar a fechar `siga_access_cards` e `siga_turnstile_devices` ao cliente.
--
-- Estas duas tabelas guardam credenciais, não referências a credenciais:
--
--   · `siga_turnstile_devices.api_key` É a autenticação do leitor físico.
--     `catracas/gate-pass-validation.ts` identifica o dispositivo por
--     `.eq("api_key", apiKey)`, e é só isso que separa uma catraca legítima de um
--     pedido HTTP qualquer.
--   · `siga_access_cards.qr_secret` e `rfid_tag` SÃO o passe. A validação aceita um
--     token que case com `card_number`, `barcode`, `qr_secret` ou `rfid_tag`. Saber
--     qualquer um destes valores de outra pessoa é entrar como ela.
--
-- `20260924230000_close_access_card_and_device_secrets.sql` fechou-as: sem política
-- nenhuma, leitura só por `service_role`, que é como toda a aplicação lhes acede.
-- Deliberadamente sem política de leitura, ao contrário das outras tabelas — uma
-- política de linha não esconde uma coluna, e qualquer SELECT que deixasse listar
-- cartões entregaria o `qr_secret` junto.
--
-- `20260925190000_harden_member_wide_policies.sql`, aplicada a 2026-09-27, criou
-- `Members read siga_access_cards` e `Members read siga_turnstile_devices` com
-- `USING (is_school_member(school_id))`. Para essa migração isto é endurecimento:
-- substitui uma política `FOR ALL` por uma de leitura. Para estas duas tabelas em
-- concreto é um passo atrás, porque o destino certo não era leitura-para-membros —
-- era nenhuma leitura. E `is_school_member` é verdadeiro para alunos e
-- encarregados (regra 4 de `docs/agents/DATABASE_RULES.md`).
--
-- Hoje NÃO há exposição: o retrato mostra `auth_select=false` e `anon_select=false`
-- nas duas. O `REVOKE ALL ... FROM authenticated` de 20260924230000 continua em
-- vigor, e uma política de RLS não concede privilégios — sem o GRANT, a política
-- não é alcançável por ninguém. A política está inerte.
--
-- Inerte não é inofensiva. Fica à espera do primeiro `APPLY_*.sql` que reconceda
-- `SELECT` a `authenticated` — e esses ficheiros existem, correm-se à mão, e já
-- desfizeram endurecimentos antes. Nesse momento a política acorda a entregar
-- números de cartão e chaves de catraca a qualquer aluno da escola, sem que
-- ninguém tenha tocado em política nenhuma. Uma porta trancada com a chave na
-- fechadura.
--
-- Se algum dia um ecrã precisar de listar cartões, o caminho é uma vista sem as
-- colunas de segredo. Não é alargar a política destas tabelas.
--
-- `tests/security/segredos-de-acesso-fisico.test.ts` exige zero políticas aqui, e
-- foi ele que apanhou isto.
--
-- Idempotente. NUNCA aplicar via Lovable. Colar no SQL Editor do projecto SGA.

DROP POLICY IF EXISTS "Members read siga_access_cards" ON public.siga_access_cards;
DROP POLICY IF EXISTS "Access cards in own school" ON public.siga_access_cards;

DROP POLICY IF EXISTS "Members read siga_turnstile_devices" ON public.siga_turnstile_devices;
DROP POLICY IF EXISTS "Turnstile devices in own school" ON public.siga_turnstile_devices;

-- Repetir o fecho de 20260924230000, para que esta migração se sustente sozinha e
-- para que a ordem entre as duas deixe de importar.
ALTER TABLE public.siga_access_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_access_cards FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_access_cards FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_access_cards TO service_role;

ALTER TABLE public.siga_turnstile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_turnstile_devices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_turnstile_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_turnstile_devices TO service_role;
