-- Verificação pública de documentos (/verificar): índice para o código.
--
-- `verifyIssuedDocument` (src/features/documents/verification.ts) procura o código em
-- `audit_logs` por `action = 'documents.issued' AND metadata->>'code' = $1`. Não havia
-- índice para isto (leitura de 2026-10-13: só pkey, school_id, actor e escola+data), e
-- cada verificação — pública, sem sessão — percorria a tabela inteira (~16 000 linhas e
-- a crescer a cada acção de cada escola). O limite de tentativas é por IP.
--
-- Índice parcial só sobre os documentos emitidos: pequeno, e a consulta já filtra pela
-- mesma acção. Não único: os códigos são aleatórios e uma colisão não deve impedir a
-- emissão. Não mexe em dados. Idempotente.

CREATE INDEX IF NOT EXISTS audit_logs_issued_document_code_idx
  ON public.audit_logs ((metadata ->> 'code'))
  WHERE action = 'documents.issued';
