# Contrato de sincronização offline — motor ainda não ligado

`src/lib/offline/sync-contract.ts` define apenas regras de validação para a
futura base SQLite cifrada e a API de sincronização; `tests/tauri/sync-contract.test.ts`
verifica isolamento da escola, autor, dispositivo, revisão e resposta do servidor.

**Não está ligado ao fluxo de notas/presenças existente.** A fila actual usa
Stronghold e os handlers existentes. A outbox Stronghold foi entretanto
endurecida: persiste `sending` ANTES do envio; após perda do ACK, ou reinício
durante o HTTP, transforma-o em `needs_verification` e bloqueia reenvios até
reconciliação assistida. A ausência de recibo transaccional no servidor impede
automatizar com segurança a recuperação destas operações. Não enviar operações desta especificação
para produção antes de existirem endpoints com `op_id` transaccional e recibos
autenticados de idempotência.

## Sequência obrigatória para activar

1. Login online com pertença/permissões e MFA comprovadas, seguido de bootstrap
   autorizado por escola + utilizador + dispositivo, com expiração curta.
2. Guardar fila num SQLite SQLCipher aberto por Rust com chave do cofre,
   sem dar aos WebViews o plugin SQL nem comandos genéricos de queries.
3. Preparar lote apenas com operações `pending` do contexto activo. Depois
   de marcar `sending`, um crash/timeout exige consultar o recibo remoto
   para o mesmo `op_id` antes de reenviar. Nunca gerar `op_id` novo em retry.
4. O servidor deve validar novamente permissões, período lectivo, RLS e MFA,
   registar `op_id + origem + hash_payload` e a nova revisão na MESMA
   transacção da mutação; mesmas origens/hashes retornam o mesmo ACK.
5. O cliente aceita resposta apenas se escola, autor, dispositivo e `op_id`
   coincidirem com o que ficou guardado; conflitos não resolvem
   automaticamente notas, matrículas e finanças.
6. Pagamentos, recibos fiscais, alterações de permissões e mudanças de
   autenticação continuam exclusivamente online.
7. Só depois de E2E comprovado em duas escolas, perda de rede,
   reinício e disputa de revisão, ligar esta camada ao runtime.

**Nota:** a validade temporal local não concede autorização por si só.
O servidor é sempre a autoridade; o contrato é uma barreira adicional, não
um substituto do RBAC/RLS.
