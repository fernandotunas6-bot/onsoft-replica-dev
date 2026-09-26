-- SIGA — mensagens directas: só o servidor as grava.
--
-- A política "Send school direct messages" deixava qualquer membro da escola
-- (incluindo alunos e encarregados) inserir mensagens pela API REST para
-- qualquer destinatário. O servidor (sendDirectMessage) passou a aplicar a
-- regra "alunos e encarregados só escrevem ao pessoal da escola"; sem retirar
-- esta política, bastava contorná-lo. O browser só lê (Realtime), e o envio já
-- passa sempre pelo servidor, com a chave de serviço.
--
-- Idempotente.

DROP POLICY IF EXISTS "Send school direct messages" ON public.siga_direct_messages;
REVOKE INSERT, UPDATE, DELETE ON public.siga_direct_messages FROM anon, authenticated;
