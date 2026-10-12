# Mobile V4 — consulta de pautas publicadas, 10/10/2026

Continuação da PR #116 sobre `6e9c7bda`, exclusivamente para o preview `staging-mobile-v4-pr116`. SHA, URL, estado da publicação e CI final serão registados na descrição actual da PR.

## Implementação

- `GET /api/mobile-v4/schools/:schoolId/results?role=aluno`, usando a autenticação, MFA, permissões por escola e resolução de âmbito académico existentes no servidor.
- Leitura real de `grade_sheets` no estado `published`, com data de publicação obrigatória, e de `grade_sheet_rows` apenas das próprias matrículas activas. Cruzamento de turma/ano/matrícula com o catálogo autorizado; escola, papel ou utilizador fornecidos no browser não ampliam acesso.
- Projecção limitada ao título/tipo/data da pauta, médias contínua/exame/pauta e resultado guardado. Não são seleccionadas observações, detalhes por disciplina, rascunhos, dados de colegas ou pautas de outro ano/escola. Estados homologado/fechado/contestado/rectificado sem publicação actual são excluídos.
- Página Aluno → Notas: consulta, filtro anual/período, actualização, estados de carregamento/erro/sem resultados e data de Luanda. Zero e média nula preservados; não se assume escala de 0–20 nem se calculam médias.
- Contrato estrito no servidor e cliente: identificadores/âmbito próprio, campos permitidos, duplicados, estados, data de publicação e números finitos. Respostas incompletas/truncadas recusadas. Troca de escola descarta e aborta pedidos antigos; 401/403 comunica a revogação ao contexto da aplicação.
- Classes CSS, ícones, navegação e selector preservados. README actualizado para distinguir a demonstração do preview autenticado.

## Validação anterior à publicação

- 137 testes Mobile em 11 ficheiros e 74 testes backend/RLS seleccionados aprovados.
- 50 verificações PostgreSQL local PGlite, executando as funções reais com SQL parametrizado. Este ciclo acrescenta isolamento de escola/ano/colega, estados de publicação, data ausente, publicação retirada, falha/truncamento das duas tabelas e preservação de zero/null/decimal. Fixtures numeric/timestamptz reproduzem a serialização PostgREST; não são dados institucionais reais.
- Colunas/tipos e restrições das duas tabelas confirmados por SELECT ao catálogo Sga, sem leitura de notas de pessoas e sem alterações da base.
- TypeScript raiz/Mobile, ESLint seleccionado/Mobile, formatação, build raiz, builds PWA/institucional/ligado e verificador PWA aprovados. CSS conserva `index-Nj-rP-jw.css`.
- Chromium com módulo compilado e transporte SDK/HTTP controlado: escola → calendário e, para aluno, pautas → filtro → actualização, em 390/768/1280 px; sem erros JS ou overflow. Calendário do professor mantém a regressão aprovada.
- Worker compilado arrancou em workerd local; login sem sessão em três larguras aprovado. Rejeição anónima do novo endpoint e comparação dos assets do preview serão confirmadas na PR após publicação.

## Limites

A consulta do professor por disciplina atribuída, lançamentos/alterações/publicação de notas, planos, submissões, chat, notificações e ficheiros continuam pendentes. A consulta implementada apresenta médias/resultados da pauta; não apresenta cada avaliação ou nota por disciplina. Apenas anos/matrículas/disciplinas actualmente activos; paginação além de 1000 linhas pendente.

Ensaios positivos usam dados controlados. Login/MFA/renovação remotos e consulta com contas reais autorizadas continuam por validar. Não se declara o aplicativo integralmente funcional.

Não houve migração, escrita de dados Sga, activação institucional no portal ou publicação na produção.
