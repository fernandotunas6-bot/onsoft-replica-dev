-- Reuniões Zoom das aulas: só com o servidor.
--
-- Leitura de 2026-10-18: `authenticated` tinha todos os privilégios em
-- `siga_lesson_meetings`; a política de leitura deixava qualquer membro da escola
-- (alunos e encarregados incluídos) ler os `join_url` de todas as aulas, e as de escrita
-- deixavam um professor mudar ou apagar a reunião da aula de um colega — por exemplo
-- trocar o link por outro. O servidor (src/features/integrations/zoom.ts) já mostra o
-- link só a quem é da turma e só deixa o professor mexer nas suas aulas, com a chave de
-- serviço; nenhum ecrã lê a tabela directamente. Tabela vazia hoje. Não mexe em dados.
-- Padrão das tabelas sensíveis (docs/agents/DATABASE_RULES.md, regra 5). Idempotente.

ALTER TABLE public.siga_lesson_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_lesson_meetings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS siga_lesson_meetings_read ON public.siga_lesson_meetings;
DROP POLICY IF EXISTS "Staff manage lesson meetings in own school (insert)" ON public.siga_lesson_meetings;
DROP POLICY IF EXISTS "Staff manage lesson meetings in own school (update)" ON public.siga_lesson_meetings;
DROP POLICY IF EXISTS "Staff manage lesson meetings in own school (delete)" ON public.siga_lesson_meetings;
REVOKE ALL ON public.siga_lesson_meetings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_lesson_meetings TO service_role;
