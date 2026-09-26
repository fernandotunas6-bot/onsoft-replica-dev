-- Remove do catálogo de integrações as oito que nunca falaram com fornecedor nenhum.
--
-- O painel de Definições → Integrações oferecia 17 integrações. Nove fazem trabalho real
-- (gateways Multicaixa/Unitel, WhatsApp Cloud API, Resend, feed ICS do calendário, OAuth
-- do Zoom, exportações SIGE, campos fiscais AGT). As outras oito pediam credenciais --
-- token de serviço do Moodle, access token do Canvas, API URL do Turnitin, Client ID da
-- Google -- e **nada no código as lia**.
--
-- O que estava por trás de cada uma, verificado ficheiro a ficheiro:
--
--   google_classroom  →  navegava para /pedagogica?tab=turmas   (página do próprio SIGA)
--   moodle            →  navegava para /pedagogica?tab=turmas   (a mesma página)
--   canvas            →  navegava para /pedagogica?tab=turmas   (a mesma página)
--   turnitin          →  navegava para /pedagogica?tab=notas    (detector de plágio que
--                        abria a pauta do SIGA)
--   microsoft_365     →  navegava para /arquivos
--   teams             →  `meetingRoomLink("teams")` devolvia um link FIXO e inventado
--                        (https://teams.microsoft.com/l/meetup-join/siga-aula-virtual)
--   firebase_analytics→  abria o próprio painel de definições (circular)
--   gmail_workspace   →  sem alvo sequer; só existia no catálogo
--
-- Três LMS diferentes apontavam todos para a mesma página interna. É a mesma classe de
-- defeito do assistente de instalação removido em 20260924180000: um caminho com ar de
-- oficial que não faz nada -- com o agravante de aqui se pedirem segredos à escola.
--
-- O código foi removido no mesmo commit (catalog.ts, install.ts, launcher.ts, actions.ts).
-- Esta migração limpa as linhas que sobravam em `school_integrations`, todas de uma só
-- escola e todas com `sandbox: true` e `installedAt` de 2026-08-12 -- dados de semente.
--
-- Porque não basta remover o código: as linhas guardam `grantedCapabilities`
-- (ex. "classroom.classes"), e `hasCapability()` lê-as. Sem esta limpeza, os botões de
-- fachada continuariam a aparecer nessa escola, agora a apontar para capacidades que o
-- catálogo já não conhece.

BEGIN;

DELETE FROM public.school_integrations
WHERE provider IN (
  'gmail_workspace',
  'google_classroom',
  'moodle',
  'canvas',
  'microsoft_365_education',
  'firebase_analytics',
  'teams',
  'turnitin'
);

COMMIT;
