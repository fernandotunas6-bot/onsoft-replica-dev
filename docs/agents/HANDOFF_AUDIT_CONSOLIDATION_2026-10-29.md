# Correcções da auditoria — 29/10/2026

Base: `009678618f3325ccea78c97f8e5be02776c5f3a8`.
Ramo: `fix/audit-consolidation-integrity-20261029`.

## Matriz de entrega

| Área | Estado no ramo | Evidência | Próximo passo |
| --- | --- | --- | --- |
| Acessos | Implementado | Cinco consultas com chave por conta/escola/cargo, sem dados provisórios de outro contexto; teste de troca de escola | QA autenticado A/B |
| WhatsApp | Implementado | Atalho recuperado no menu, condicionado à integração e capacidade administrativa; reutiliza endpoint com guardas existentes, prepara mensagem e oferece ligação explícita para abrir o WhatsApp | Browser/dispositivo real; não foi enviada mensagem |
| Notas | Implementado; publicação bloqueada pela migração | RPC única, auditoria transaccional, validações preservadas, comparação da versão observada e recusa explícita sem RPC | Staging PostgreSQL, concorrência com duas conexões e instalação controlada antes do código |
| Devolução de trabalhos | Implementado; publicação bloqueada pela migração | Nota + devolução + auditoria na mesma transacção; repetição idempotente | Staging e falha de rede após commit |
| Documentos docentes | Parcial | Escola e turmas atribuídas revalidadas, grant de escrita pedagógica; chamadas académicas e boletim da ficha transportam contexto | Sessões reais; dados canónicos e âmbito disciplinar fino |
| Verificação pública | Implementado | Confirma registo da emissão, sem anunciar validação integral do conteúdo | Registo definitivo ligado à fonte institucional |

## Migração e contribuições preservadas

Recuperados da PR #345, sem a fundir integralmente: contrato das RPCs,
`20261030020000_academic_write_integrity.sql`, ensaio SQL e adaptação dos testes
da devolução. O pacote mantém também a RPC de organização etária, ainda sem
consumidor novo neste ramo. Não criar outra migração com as mesmas funções.

A validação de lote da main (duplicados, finitos, 0–20, cotação, escola e turma)
foi preservada. A RPC acrescenta comparação da existência/nota observada; um
conflito reverte o lote inteiro. As funções são INVOKER, apenas service_role;
autorização por papel/grant/âmbito continua obrigatória no servidor.

As funções estão explicitamente em `FUNCOES_ESPERA_MIGRACAO`. Snapshot e tipos
gerados de produção não foram alterados. Não fazer merge/deploy deste ramo antes
da homologação e instalação da migração: a ausência das RPCs bloqueia a escrita,
sem regressar à gravação não atómica.

## Limites dos documentos

O endpoint ainda recebe conteúdo do browser; validar a turma declarada não prova
que cada aluno, disciplina ou valor impresso corresponde à fonte institucional.
`verification_scope=issuance_registration` regista essa fronteira e a página
pública diz «Emissão registada». A migração de todos os modelos para composição
canónica no servidor permanece pendente; não declarar este risco integralmente
resolvido. Não foram alterados valores históricos nem registos de emissão.

## Verificação executada

- Suite global: 792 ficheiros aprovados, 3 ignorados; 5.510 testes aprovados,
  19 ignorados. Sem credenciais ou pedidos institucionais reais.
- Após completar contexto do boletim e mapa de turmas: 47 testes em seis
  ficheiros aprovados; não somar esta contagem à suite global.
- `npm run typecheck`: aprovado; build cliente/SSR/Worker aprovado.
- ESLint dos ficheiros alterados, Prettier, `git diff --check`, estilo e
  acessibilidade estáticos aprovados. Não equivalem a QA visual/aparelho físico.
- `SIGA_SQL_TEST_MODULE_PATH=... node tests/sql/academic-write-integrity.mjs`:
  aprovado em PGlite com dados sintéticos: aplicação dupla, ACL, escola,
  null/zero, rollback de lote/conflito/auditoria/devolução, pauta/período,
  repetição e vínculo tarefa/avaliação. Não prova concorrência entre conexões,
  Auth/PostgREST/RLS remotos ou instalação na produção.
- Colunas das seis tabelas críticas conferidas no snapshot do repositório.

## Consolidação de PRs

#390/#391/#393/#395: funcionalidades encontradas na main com reforços posteriores;
candidatas a encerramento após última conferência de commits/lockfile.
#392: parte das chaves por escola estava ausente na main; este ramo recupera e
alarga para conta/cargo. O reset global existente mitigava o risco, pelo que não
foi demonstrada fuga remota de dados. Não confundir ramo corrigido com main
corrigida, nem fechar a #392 como integralmente absorvida antes da integração.

Produção, migrações remotas, envio de mensagens e merge não executados.


## Refinamento seguinte — partilha e limite de emissão

- A preparação do WhatsApp não chama `window.open` depois de um pedido remoto:
  um diálogo mostra a acção explícita «Abrir WhatsApp», evitando bloqueios de
  popup. Não depende de Clipboard e não envia mensagens automaticamente.
- O helper partilhado conserva o texto mesmo sem número de telefone; antes
  devolvia apenas `https://wa.me/` e perdia a mensagem.
- Exclusão síncrona de operações repetidas com `useRef`, incluindo recuperação,
  senha e bloqueio. A janela de partilha não recebe a acção de suspensão.
- Emissão documental reutiliza `consumeRateLimit`, também usado na verificação
  pública. O contador é partilhado quando a RPC está disponível; o fallback em
  memória do serviço existente permanece, sem prometer limite distribuído
  durante indisponibilidade da base.
- 26 testes dirigidos aprovados em quatro ficheiros, incluindo quatro testes
  de interacção com o menu/diálogo e negações de permissão/integração.
- Git HTTPS local não tinha credenciais; a publicação usa o conector GitHub
  autorizado pelo proprietário em 29/10, preservando conteúdo e histórico remoto.


## Estado de consolidação

A PR #404 foi aberta em rascunho. #390/#391/#393/#395 foram encerradas como
substituídas pela #396, com ramos e histórico preservados; package.json e bun.lock
coincidem com a main. #392 permanece aberta até integrar a recuperação da cache.
A CI inicial passou a auditoria de dependências e Academic Import Check, mas
rejeitou a formatação de duas asserções no ensaio SQL (.mjs). A formatação foi
corrigida e o lint integral repetido; não se desactivou nenhum controlo.

## Revisão de 29/10 (Claude Code)

- **Emissão docente:** `registerIssuedDocument` chamava
  `requireSgaWriterForWrite("pedagogica", userId)` sem lista de cargos; o guarda
  só aceita então Administrador/Secretaria/Tesouraria e recusava os professores sem
  permissão extra. Passa `["Professor"]`; o teste simula o contrato real do guarda.
- **Ordem da migração:** renomeada de `20261026110424` para `20261030020000`,
  depois da última já aplicada na produção (`20261029190000_teacher_document_entries`)
  e das da #410 (`20261029220000_class_subject_teacher_periods`,
  `20261029220100_audit_logs_force_rls`). Um primeiro nome, `20261029220000`, repetia
  a versão da #410 e foi trocado (30/10).
- **Bloqueios:** a escola passa de `FOR UPDATE` a `FOR SHARE` nas três funções
  (deixa de travar as inserções com FK para `schools` em toda a escola e de pôr
  todos os lançamentos de notas da escola em fila). A serialização passa a ser por
  turma (`class_groups FOR UPDATE`), com a ordem turma → avaliação → matrículas nas
  três funções; a devolução bloqueia a avaliação `FOR UPDATE` (não `FOR SHARE`)
  para não haver deadlock por subida de lock. O ensaio SQL confere esta ordem no
  texto; concorrência entre ligações continua por ensaiar em staging.
