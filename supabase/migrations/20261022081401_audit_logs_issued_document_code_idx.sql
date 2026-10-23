-- Verificação pública de documentos (/verificar): procura audit_logs por
-- action = 'documents.issued' e metadata->>'code'. Sem índice, cada pedido percorria
-- a tabela inteira. Parcial: só as linhas de documentos emitidos. Idempotente.
-- Aplicada na produção a 2026-10-22 (versão 20261022081401).
CREATE INDEX IF NOT EXISTS audit_logs_issued_document_code_idx
  ON public.audit_logs ((metadata ->> 'code'))
  WHERE action = 'documents.issued';
