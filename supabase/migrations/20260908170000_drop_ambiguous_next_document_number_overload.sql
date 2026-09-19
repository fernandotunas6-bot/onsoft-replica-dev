-- private.next_document_number tinha DOIS overloads: (uuid, text) — estrito,
-- exige que document_sequences já exista, senão 55000 — e (uuid, text, text
-- DEFAULT NULL) — auto-cria a sequência em falta via INSERT ... ON CONFLICT
-- DO NOTHING antes de gerar o número. Como o terceiro parâmetro tem DEFAULT,
-- a função de 3 argumentos também aceita chamadas com 2 argumentos — a
-- mesma assinatura de chamada do overload estrito. Toda a chamada de 2
-- argumentos (register_payment, create_financial_contract, …) ficou
-- ambígua e passou a falhar sempre com 42725 "function … is not unique".
-- Descoberto ao vivo no Ciclo 60 ao tentar registar o primeiro pagamento.
--
-- Corrigido removendo o overload estrito e redundante — o de 3 argumentos é
-- um super-conjunto funcional (mesmo resultado quando a sequência já existe,
-- mais tolerante quando não existe) e já é o único usado pelas chamadas de
-- 3 argumentos (issue_school_document, create_student_case,
-- archive_school_record).

DROP FUNCTION IF EXISTS private.next_document_number(uuid, text);

NOTIFY pgrst, 'reload schema';
