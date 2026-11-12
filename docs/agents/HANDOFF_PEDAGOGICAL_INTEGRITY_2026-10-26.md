# Correcções da auditoria pedagógica — 26/10/2026

Base: `ba289e0e` (main). Ramo: `fix/pedagogical-integrity-20261026`.

## Comportamento entregue

- PAP obrigatória sem nota válida mantém `PENDENTE`; não se emite `APTO (PAP)`.
- Organização etária consulta também `siga_attendance_records` através de sessões,
  por aluno/turma/ano, além dos registos legados por matrícula. Leituras paginadas.
- A mudança por idade passa pelo núcleo de matrícula com uma opção explícita de
  reorganização; uma RPC revalida registos e origem na mesma transacção da mudança.
  Transferências autorizadas mantêm o seu caminho. O gatilho canónico de lotação
  continua activo. AAL2 continua exigido no servidor antes de chamar o núcleo.
- Nota, estado de devolução e auditoria passam a uma transacção. Falha em qualquer
  passo desfaz tudo. Retry idêntico da devolução devolve sucesso sem novo aviso;
  devolução com nota diferente não sobrescreve a primeira.
- `IS DISTINCT FROM` distingue `null` e zero na auditoria. O lote de notas é
  atómico, incluindo a sua auditoria; não há fallback de escrita por passos.
- Histórico de trabalhos, tentativas e anexos lido por páginas/lotes de IDs,
  conservando anos anteriores e evitando URLs com milhares de UUIDs.
- Horários da Pedagógica e do professor deixam de ser cortados em 500 aulas.
  O limite de segurança da leitura completa gera erro explícito, nunca dados
  parciais apresentados como consulta completa.
- Falhas de leitura da estrutura académica propagam erro, em vez de virarem zero.

## Implantação e dependência obrigatória

Migração **nova e ainda não aplicada**:
`supabase/migrations/20261026110424_academic_write_integrity.sql`.
Gerada pelo CLI com `supabase migration new academic_write_integrity`.

Três funções públicas **SECURITY INVOKER, só service_role**, com REVOKE explícito
para PUBLIC/anon/authenticated. Os guards de papel, módulo, docente e escola no
servidor continuam obrigatórios. A RPC repete âmbito, vínculo activo, condições
académicas e locks; não é uma API para o browser escolher actor ou escola.
Tipos gerados não foram editados: extensão local tipada em `academic-write-rpcs.ts`.
As funções estão em `FUNCOES_ESPERA_MIGRACAO` até recapturar o retrato efectivo.

**Não fundir/publicar o código antes de aplicar e validar a migração no destino.**
Sem as funções, as três operações recusam com mensagem clara. Não se regressa ao
caminho inseguro. Sequência: staging independente → aplicar SQL duas vezes →
ensaiar perfis/concorrência → recapturar snapshot/tipos e retirar espera → promover
SQL validado e código na ordem correcta. Só foi encontrada a branch principal do
projecto Supabase nesta sessão; não foi criado recurso pago nem alterada produção.

## Evidência executada

- `npm run typecheck`: aprovado.
- `npm test -- --maxWorkers=2`: **4.875 aprovados, 19 ignorados**, 713 ficheiros
  aprovados e 3 ignorados. O jsdom emite aviso de navegação não implementada num
  teste existente, sem falhar. Não equivale a E2E de navegador.
- `npm run build`: aprovado (cliente, SSR e Worker); avisos de chunks grandes,
  inputValidator depreciado e directivas use client nas dependências.
- ESLint nos ficheiros alterados e `git diff --check`: aprovados.
- `SIGA_SQL_TEST_MODULE_PATH=<PGlite>/dist/index.js node tests/sql/academic-write-integrity.mjs`:
  aprovado, aplicação dupla, grants, âmbito, período/pauta fechados, null/zero,
  rollback de lote, auditoria e devolução, retry e protecção da chamada actual.
- Ensaio de lote etário parcial: retoma não repete mudanças já concluídas.

Dependências instaladas com npm sem alterar package.json ou bun.lock. O CI com
instalação congelada continua a ser o portão para o lockfile oficial.
PGlite não demonstra dois clientes concorrentes, RLS efectiva em produção,
OAuth/MFA real, contas reais, aparelhos ou autorização de fornecedores.

## Revisão das conclusões iniciais

- **Períodos mistos (F05):** `periodModelFor` é o default do calendário geral da
  escola; o superior tem inscrições e regulamento próprios. Não foi demonstrado
  que o helper, por si, altere o semestre de uma inscrição. Não mudar toda escola
  mista para dois períodos: isso quebraria o ensino geral. A modelação de
  calendários simultâneos por curso exige contrato e configuração explícitos.
- **GPA (F06):** o helper `passingThreshold` não é usado no fluxo de decisão das
  unidades curriculares auditado. `seasonResult` já exige exame e usa o regulamento.
  Não alterar a conversão GPA ou o limiar institucional sem definir se é da
  disciplina ou da média agregada. A média parcial isolada não prova aprovação.
- **Lotes parciais (F08):** a interface já distingue concluídos/falhados e o núcleo
  conserva a unicidade anual. A retoma foi testada. Um job persistente ou uma
  redistribuição de tudo-ou-nada seria uma evolução própria, não uma correcção
  necessária para ocultar resultados parciais que já são explícitos.

## Trabalhos paralelos

A #336 já inclui #335; a #341 já inclui #339. Não duplicar merges.
O refinamento dos horários é preparado separadamente em
`fix/horarios-configured-20261026`, sobre a #338, preservando a contribuição do
Claude. As mudanças de paginação dos dois ramos são equivalentes: conservar uma
única versão na integração. #340/#332/#343 permanecem trabalhos independentes;
este ramo não os publica nem aplica o SQL da presença docente.

## Pendências reais

Ensaio PostgreSQL com duas conexões (incluindo fecho/homologação e criação de
presença concorrentes), migração em staging, ensaio autenticado em duas escolas,
recaptura de tipos e CI da head. Paridade Flutter, calendários por curso,
substituições persistentes e rubricas completas continuam evoluções de produto
que precisam de contratos próprios; não foram declaradas corrigidas por esta PR.
