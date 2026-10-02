-- `siga_access_cards` e `siga_turnstile_devices` são um cofre, não uma tabela de dados.
--
-- `siga_turnstile_devices.api_key` **é** a autenticação do dispositivo físico:
-- `gate-pass-validation.ts:64` procura o dispositivo por `.eq("api_key", apiKey)`, e é só
-- isso que separa um leitor de catraca legítimo de qualquer pedido HTTP.
--
-- `siga_access_cards.qr_secret` **é** o passe: `gate-pass-validation.ts:85` aceita um token
-- que case com `card_number`, `barcode`, `qr_secret` **ou** `rfid_tag`. Conhecer qualquer
-- um destes quatro valores de outra pessoa é entrar como ela.
--
-- Ambas tinham `FOR ALL TO authenticated USING is_school_member(school_id)` — a mesma
-- política larga das outras. Aqui a consequência é de controlo de acesso físico: qualquer
-- membro da escola, incluindo um aluno, podia
--
--   · ler o `qr_secret` e o `rfid_tag` de qualquer colega e passar a catraca como ele;
--   · ler o `api_key` de qualquer leitor e forjar entradas e saídas;
--   · emitir um cartão a si próprio, ou alterar `status`/`expires_at` de um cartão alheio;
--   · alterar o `api_key` de um dispositivo e deixá-lo de fora.
--
-- **Latente, não explorado:** à data desta migração as duas tabelas estão vazias (0
-- dispositivos, 0 cartões) — o módulo ainda não foi posto em serviço. É por isso que se
-- fecha agora: depois de haver cartões emitidos, isto deixa de ser uma migração e passa a
-- ser um incidente.
--
-- ---------------------------------------------------------------------------------------
-- A CORRECÇÃO: nenhum acesso pelo cliente do utilizador, nem de leitura.
--
-- Ao contrário das tabelas fechadas antes, aqui não se guarda uma política de `SELECT`.
-- Verificado ficheiro a ficheiro: as 18 ocorrências em `catracas/server.ts`,
-- `gate-pass-validation.ts` e `device-webhook-handler.ts` correm **todas** em `db`, de
-- `loadSgaAdminClient()`. Nenhum ecrã lê estas tabelas com a sessão do utilizador, e uma
-- política de linha não consegue esconder uma coluna: qualquer `SELECT` que deixasse um
-- administrador listar cartões entregaria o `qr_secret` junto. Os segredos ficam onde
-- pertencem — do lado do servidor.
--
-- Se um dia um ecrã precisar de listar cartões directamente, o caminho é uma vista sem as
-- colunas de segredo, não alargar a política desta tabela.
--
-- APLICADA à produção (xodgfmxiaunpamctfeea) em 2026-09-24, e o retrato recapturado.

DROP POLICY IF EXISTS "Access cards in own school" ON public.siga_access_cards;
DROP POLICY IF EXISTS "Turnstile devices in own school" ON public.siga_turnstile_devices;

-- RLS fica activa e sem políticas: nega tudo a `authenticated`. `service_role` ignora RLS
-- e continua a poder, que é por onde a aplicação inteira lá chega.
ALTER TABLE public.siga_access_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_turnstile_devices ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.siga_access_cards FROM authenticated, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.siga_turnstile_devices FROM authenticated, anon;
