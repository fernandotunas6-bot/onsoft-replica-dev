-- Mesma classe de bug que 20260908140000 (role_permissions): `school-bootstrap.ts`
-- nunca semeia `public.document_sequences`, e `private.next_document_number()`
-- (usada por `private.register_payment` para gerar o nº do recibo, entre
-- outras RPCs RBAC-v2) rejeita com 55000 "Sequência de documentos não
-- configurada para esta escola" quando a linha não existe — registar um
-- pagamento numa escola criada pelo assistente WEB /start falha sempre.
-- Descoberto ao vivo no Ciclo 60, logo a seguir ao fix de role_permissions.
--
-- Confirmado ao vivo: a "Colegio Adventista - Huambo" (semeada manualmente)
-- tem exactamente 2 linhas — invoice (prefixo FT) e receipt (prefixo RC),
-- padding 6, a começar em 1. Esta migração replica o mesmo padrão para
-- qualquer escola em falta, aditiva e idempotente.

INSERT INTO public.document_sequences (school_id, document_type, prefix, next_number, padding)
SELECT s.id, seq.document_type, seq.prefix, 1, 6
FROM public.schools s
CROSS JOIN (VALUES ('invoice', 'FT'), ('receipt', 'RC')) AS seq(document_type, prefix)
ON CONFLICT (school_id, document_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
