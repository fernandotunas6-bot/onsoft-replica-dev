# SIGA Plus — refinamento contextual de Pessoas e Ficha da Turma (29/10/2026)

## Âmbito desta PR
Mudanças isoladas nas páginas visíveis em capturas do proprietário: `/pessoas` e `/pedagogica/turmas/$turmaId`. Não é uma execução do visual em todo o sistema; não declarar as restantes páginas concluídas.

### Pessoas / Professores
- Acções secundárias do cabeçalho num menu acessível «Mais opções»: exportação CSV/PDF/oficial da página e importação de docentes. A criação, organização de turmas, acessos, ajuda e mesclagem mantêm os fluxos existentes.
- Nomes de professores com ligação à ficha; menu por linha para ficha, documentos e CSV individual. Editar e desactivar mantêm os formulários e confirmações anteriores.
- Menu por pessoa com ficha e CSV individual; linha continua navegável, mas só o próprio alvo de teclado da linha pode activar a navegação por Enter/Espaço. Não há novas mutações nem exposição de dados adicionais.

### Ficha da Turma
- Menor ruído visual no cabeçalho, resumo e cartões.
- Duas colunas de conteúdo independentes no desktop: alunos/horário e disciplinas/avaliações; painel docente conserva o contexto à direita.
- Listas longas progressivas: 10 alunos, 8 tempos e 8 avaliações iniciais, com «Mostrar todos»/«Mostrar menos». Pesquisa de alunos continua filtrada, ordenada e limitada à turma; a expansão é isolada por ID de turma.
- Disciplinas e nomes dos professores atribuidos ligam às fichas que já existem, sem alterar a atribuição.
- Relações e recomendações ficam numa secção `details` acessível, expandível; não foram removidas.

## Preservação
- Sem migrações, alterações de SQL/RLS/RBAC/MFA ou alterações de servidor.
- Sem alteração de valores académicos, cálculo de médias, matrícula, presenças, notas, documentos ou operações financeiras.
- A cache, as rotas, a escola activa, as permissões e os componentes existentes permanecem a fonte de verdade.
- `#392` já tratou Acessos e Alunos; evitar reconstruir essas operações aqui. Não efectuar rebase/force push sobre trabalho já publicado.

## Checklist de QA antes de merge/deploy (pendente)
1. Validar `npm run typecheck` (ou equivalente configurado), build, ESLint, Prettier e testes Vitest.
2. Percursos de Administração/Secretaria/Professor, incluindo edição, desactivação confirmada, exportações e processos documentais.
3. Turma com 0, 1, 10, 15 e mais de 30 alunos; horários com mais de 8 tempos; avaliações com mais de 8 linhas; nomes grandes e sem professor atribuído.
4. Regressão do `?secao=`/foco, troca de turma, pesquisa acentuada, expansão/recolha, teclado, leitor de ecrã e 390/768/1024/1440 px.
5. Ensaios autenticados em duas escolas num staging independente, nunca dados reais de produção.
6. Conferir CI da SHA final antes do merge. A PR não autoriza deploy sem evidência.

## Continuação após integração
Aplicar o mesmo padrão aos perfis de pessoas e docentes, turmas, alunos, matrículas, disciplinas, notas, horários, documentos e RH seguindo o contrato em `docs/design/VISUAL_MASTER_2026.md`, sem duplicar os refinamentos de outras PRs.
