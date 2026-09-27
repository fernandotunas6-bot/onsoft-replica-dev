-- validate_issued_document: fecha a chamada directa pela API.
--
-- Função SECURITY DEFINER executável por `anon` e `authenticated` via
-- /rest/v1/rpc/validate_issued_document, sem o limite de tentativas da
-- verificação pública da aplicação (verifyIssuedDocument, que lê audit_logs
-- pelo servidor com consumeRateLimit). Nenhum código a chama; fica só para o
-- servidor. Idempotente.
REVOKE EXECUTE ON FUNCTION public.validate_issued_document(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_issued_document(text) TO service_role;
