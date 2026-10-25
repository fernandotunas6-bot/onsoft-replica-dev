# SQLite local do SIGA Desktop — esquema v1 (não activo)

**Questão de segurança:** SQLite normal NÃO cifra a base de dados. Esta fase
cria apenas a migração SQL e os testes de integridade; não inclui nenhum
comando IPC ou caminho que guarde alunos, presenças ou notas no disco.

## Ficheiros

- `desktop/local-db/0001_offline_metadata.sql` — DDL SQLite v1: contextos
  por escola + actor + dispositivo, operações offline, ACKs, cursores,
  conflitos e tombstones. A origem de cada operação é imutável.
- `tests/tauri/test_sqlite_schema.py` — SQLite real em memória, com casos de
  mistura de tenants, chaves idempotentes, recibos, conflitos e migração.

Validar com:

```bash
python3 -m unittest discover -s tests/tauri -p 'test_sqlite_schema.py'
```

Este DDL **não deve ser executado no Supabase/PostgreSQL**, nem num ficheiro
SQLite normal no posto. Apenas ensaios em `:memory:` usam SQLite normal.

## Contrato obrigatório para activar o armazenamento nativo

1. Seleccionar biblioteca SQLCipher compatível com Tauri v2,
   Windows/macOS/Linux, com bibliotecas e lockfiles reproduzíveis.
2. Derivar/guardar chave aleatória por posto/actor/escola num cofre próprio,
   sem colocar a chave no JavaScript, localStorage, logs ou bundle.
3. Confirmar `PRAGMA cipher_version` **não vazio** e a abertura com
   `PRAGMA key` antes de quaisquer queries, incluindo metadados. Nunca
   fazer fallback para SQLite normal.
4. Executar migrations dentro de uma transacção; confirmar `user_version`
   e recusar versões desconhecidas, upgrades e downgrades destrutivos.
5. Ligar a base ao login autorizado online e validar validade da autorização,
   revogação, MFA e pertença à escola antes de expor qualquer dado pessoal.
6. Na perda de rede, o dispositivo pode consultar apenas dados aprovados dentro
   da validade; acções financeiras e alterações de permissões ficam online.
7. Integrar depois endpoints idempotentes do servidor com `op_id` e revisão
   do registo. Timeout, erro de rede e conflito **não** significam sucesso.
   Manter fila Stronghold existente enquanto não houver migração provada sem
   perdas. Não declarar sincronização automática concluída com esta fase.

## Invariantes do esquema

- `offline_contexts(school_id, actor_id, device_id)` é a âncora de todas
  as linhas: foreign keys activas e queries sempre com triplo filtro.
- `op_id` é único e imutável, assim como payload, revisão esperada e origem.
- `offline_receipts` representa confirmação validada do servidor.
- `offline_conflicts` mantém diferenças para revisão humana — nunca
  gravar notas por "última edição vence" automaticamente.
- `offline_tombstones` impede que exclusões ressuscitem em pulls antigos.
- Payload e cursores deverão permanecer cifrados em disco; a própria base
  terá obrigatoriamente cifragem SQLCipher quando activada.

**Estado:** migração v1 e testes disponíveis; motor SQLCipher, key management,
autenticação offline, bootstrap e sincronização ainda por implementar.

## Diagnóstico Tauri integrado na pré-visualização

A janela `offline-shell` consulta o comando tipado `desktop_offline_readiness`.
O comando fornece apenas a versão nativa, existência do bundle/esquema, estado
do actualizador assinado e estado das funcionalidades offline. **Nunca devolve
nomes de escolas, caminhos de armazenamento, PINs ou credenciais.**

Esta pré-visualização tem uma única autorização IPC extra:
`allow-desktop-offline-readiness`, sem plugin de ficheiros, Store, Stronghold,
SQL, shell, updater ou acesso a funções administrativas.

Os campos `sqlcipherReady`, `authorizedBootstrapReady`,
`bidirectionalSyncReady` e `privateDataOfflineReady` permanecem `false`
até cada implementação ser verificável. Se o comando falhar, a interface
não anuncia capacidades offline adicionais. Isto é um **diagnóstico real
de bloqueios**, não um motor SQLite ou um sistema de sincronização.
