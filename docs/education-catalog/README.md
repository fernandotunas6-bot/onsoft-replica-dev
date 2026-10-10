# SIGA Global Education Engine — catálogo educacional

Estado a 2026-10-10. Primeira entrega: fases 1–3 (auditoria, esquema, classificações
internacionais), Angola e Portugal com planos, Moçambique só com etapas, motor de
identificadores, pesquisa e página de consulta.

## O que existe

| Peça | Onde |
|---|---|
| Dados (fonte única) | `src/features/education-catalog/data/` — `isced.ts`, `sources.ts`, `countries.ts`, `subjects.ts`, `courses.ts`, `stages.ts` |
| Consultas com contexto de nível obrigatório | `src/features/education-catalog/catalog.ts` |
| Pesquisa local (sem acentos, códigos, siglas, sinónimos, uma/duas letras trocadas) | `src/features/education-catalog/search.ts` |
| Normalização de classes, períodos e disciplinas; duplicados | `src/features/education-catalog/normalize.ts` |
| Identificadores curtos | `src/features/education-catalog/identifiers.ts` |
| Página **Pedagógica → Catálogo global** (`/pedagogica/catalogo`) | `CatalogExplorer.tsx`, `src/routes/pedagogica_.catalogo.tsx` |
| Esquema | `supabase/migrations/20261010120000_global_education_catalog.sql` |
| Carga (gerada, idempotente) | `supabase/seeds/education/catalog.sql` — `npm run siga:catalog-seed` |
| Testes | `tests/education-catalog/*`, `tests/sql/education-catalog.mjs` (PGlite) |

### Camadas

1. **Global** — níveis ISCED 2011 (0–8), áreas ISCED-F 2013 (12 grandes + 29 restritas),
   países (ISO 3166/4217), 115 disciplinas e 54 cursos de referência com sinónimos.
2. **Nacional** — etapas de ensino por país, classes/anos, modelos de períodos, escala de
   avaliação, cursos por etapa e plano curricular (disciplinas obrigatórias e de opção por
   curso e classe), com fonte, versão e estado.
3. **Escola** — já existia: `academic_levels`, `programs`, `grade_levels`, `subjects`,
   `curricula`, `curriculum_subjects`. Não foi duplicada.
4. **Histórico** — cada entrada do plano tem `version` e `effective_from/until`; uma versão
   nova entra ao lado da antiga (que passa a `outdated`), nunca por cima.

## Cobertura real

Nada aqui é estimado; é o que `catalogCoverage()` devolve e a página mostra.

| País | Etapas | Classes/anos | Etapas com plano | Disciplinas nos planos | Cursos | Estado |
|---|---|---|---|---|---|---|
| Angola | 6 | 22 | 4 | 46 | 16 | Em revisão |
| Moçambique | 6 | 16 | 0 | 0 | 0 | Em revisão |
| Portugal | 8 | 20 | 4 | 29 | 19 | Em revisão |
| Brasil, Cabo Verde, Guiné-Bissau, São Tomé e Príncipe, Timor-Leste | 0 | — | — | — | — | Por carregar |

- **Oficial verificado**: só as classificações da UNESCO e os códigos ISO.
- **Em revisão**: os planos nacionais. Foram escritos a partir da lei e dos planos conhecidos
  (Angola: Lei 17/16 + 32/20 e planos INIDE — a mesma lista dos modelos de estrutura já usados
  pelas escolas; Portugal: DL 55/2018; Moçambique: Lei 18/2018), mas ainda não conferidos
  linha a linha com o documento publicado. Um teste impede que alguém os marque como
  verificados sem mudar o teste.
- **Por importar**: disciplinas por classe em Moçambique (INDE), opções do 12.º ano e cursos
  profissionais em Portugal, unidades curriculares do ensino superior (variam por
  instituição), cargas horárias (variam por plano), áreas ISCED-F de 4 dígitos.

O catálogo **não** diz que uma escola está autorizada a oferecer um curso.

## Estrutura da escola a partir do catálogo (fase 8)

Pedagógica → Estrutura → **Usar modelo de estrutura** tem agora «Sistema de ensino»:

- **Angola**: o ecrã de sempre (modelos de `curriculum-templates.ts`), sem mudanças.
- **Portugal / Moçambique**: as etapas do catálogo com classes/anos e, onde as há, os cursos.
  `plan-from-catalog.ts` gera o mesmo `CurriculumPlan` e grava-o o mesmo
  `applyCurriculumPlan` (idempotente). Entram só as disciplinas **obrigatórias** do plano,
  com o nome do país («Português»); as de opção ficam para a escola. Etapas sem plano
  (Moçambique) criam classes e turmas sem disciplinas, e o resumo diz quais.
- Servidor: `applyCatalogStructure` (Administrador/Secretaria, escrita na Pedagógica, escola
  da sessão); recusa etapas de outro país e cursos que a etapa não tem.
- Códigos de turma: `1A-M`, `CT10A-M` (secundário), `LICGEST1A-M` / `MESGEST1A-M` (superior,
  porque o mesmo curso existe em graus diferentes), `ES1A-M` (superior sem cursos).

**Duplicados ao aplicar (todos os países, Angola incluída):** uma disciplina que a escola já
tem com outra grafia é reaproveitada — «Inglês» serve para «Língua Estrangeira (Inglês)»,
«Ed. Física» para «Educação Física». Só por correspondência exacta de nome ou sinónimo do
catálogo, nunca por código («EM» é Estudo do Meio nos modelos e Educação Moral noutros
sítios) nem por letras trocadas.

## Contexto de nível

Toda a sugestão de disciplina pede uma etapa (país + nível) ou um nível ISCED + via. Física
não aparece no primário; Termodinâmica só no superior; «Estudo do Meio» não aparece no
superior. `validateSubjectContext()` devolve o motivo («Física não é uma disciplina de
«Ensino Primário».»). Curso ou classe que não pertencem à etapa são recusados.

## Pesquisa

Corre sobre os dados empacotados — funciona sem rede, sem base e sem IA. Com ~170 registos
é mais rápida em memória do que um pedido à base; a pesquisa em PostgreSQL (FTS/trigramas)
fica para quando os catálogos nacionais tiverem milhares de linhas.

Ordem: código → sinónimo → início do nome → iniciais (`emc`) → início de palavra (`mat` →
Métodos Matemáticos) → texto contido → erro tipográfico. As disciplinas do plano da etapa
sobem; nomes locais contam (`Português` em Portugal).

## Identificadores curtos

| Entidade | Formato | Emitido por |
|---|---|---|
| Aluno | `EST-000123` (já existia; CHECK na base) e código público de 7 dígitos `0000123` | `private.register_student()` |
| Documento | `<PREFIXO>-000123` | `private.next_document_number()` (já existia) |
| Professor, funcionário, turma, sala, curso, disciplina, matrícula | `P-0012`, `F-0012`, `T-001`, `S-001`, `C-001`, `D-001`, `M-000123` | `private.next_entity_identifier()` (novo, só servidor) |

UUID continua a ser a chave primária. `next_entity_identifier` usa `INSERT … ON CONFLICT DO
UPDATE … RETURNING` numa linha por escola + entidade: o bloqueio da linha garante números
diferentes em pedidos simultâneos. Os códigos não são credenciais e não vão em URLs
públicas de dados pessoais.

**Ainda não ligado**: nenhum fluxo existente passou a chamar `next_entity_identifier`; os
códigos das turmas e salas continuam como hoje. Ligar só depois de a migração estar aplicada.

## Aplicar (dono, SQL Editor) — não aplicado

1. `supabase/migrations/20261010120000_global_education_catalog.sql` (idempotente; tabelas
   novas, nenhuma alteração a tabelas existentes).
2. `supabase/seeds/education/catalog.sql` (idempotente).
3. Recapturar o retrato (`npm run siga:db-snapshot`).

Ensaio local: `SIGA_SQL_TEST_MODULE_PATH=<…/pglite/dist/index.js> node tests/sql/education-catalog.mjs`
— migração e carga duas vezes, contagens iguais, chaves estrangeiras, estados, anon sem
acesso, authenticated só lê, sequências sem repetir.

A página e a pesquisa **não** dependem destas tabelas (usam os dados empacotados), por isso
não há nada em `TABELAS_AUSENTES_DA_PRODUCAO`.

## Próximas fases

- ~~Assistente de estrutura para Moçambique e Portugal~~ (feito, ver acima).
- Ligar `subjects.catalog_subject_code` e `programs.catalog_course_code` (colunas novas, por
  `ALTER TABLE`) e usar `findSubjectDuplicates` para propor fusões com mapeamento auditado.
- Documentos e pautas a resolverem nomes pelo catálogo (mantendo o nome à data da emissão).
- Painel de governação no ADMIN (aprovar propostas, versões, comparar, restaurar) com
  `catalog_review_queue`.
- Conferir os planos com os documentos oficiais e passar a «Oficial verificado».
- Mobile V4: consumir `catalog.ts` (o mesmo módulo), sem catálogo próprio.
