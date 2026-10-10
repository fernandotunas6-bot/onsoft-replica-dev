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

## Rever disciplinas da escola (fases 9–10, primeira parte)

Pedagógica → Estrutura → **Rever disciplinas** compara as disciplinas da escola com o
catálogo (`subject-review.ts`, `subject-review-server.ts`, `SubjectReviewDialog.tsx`):

- **Duplicados** — a mesma disciplina mais de uma vez («Matemática», «Matematica», «MAT»),
  com o número de ligações (turmas, currículos, professores). A escola escolhe a que fica
  (por omissão a mais usada) e as que se juntam (siglas soltas vêm desmarcadas), e confirma.
  Ver «Juntar duplicados» abaixo.
- **Nomes a corrigir** — só grafia (acentos, maiúsculas), uma letra trocada, ou sigla usada
  como nome. Sinónimos legítimos («Inglês») ficam. Siglas vêm desmarcadas («EM» pode ser
  Educação Moral). O nome segue o país da escola (pela moeda: AOA → Angola, EUR → Portugal,
  MZN → Moçambique).
- **Próprias da escola** — sem correspondência no catálogo; ficam como estão.

A correcção só muda `subjects.name` (o código, as turmas e as notas ficam), exige
Administrador/Secretaria, 2FA na sessão e `academic.subjects.manage` (política de UPDATE), e
fica no registo de auditoria (`academic.subject.renamed_to_catalog`). O servidor recalcula a
revisão e só aplica o que ele próprio sugere, e só se o nome não mudou entretanto. Usa o
cliente do utilizador (RLS), não o privilegiado.

## Criar disciplina com o catálogo

Pedagógica → Disciplinas → **Nova**: o campo «Disciplina» sugere os nomes do catálogo
(com o nome do país) enquanto se escreve, e por baixo aparece, antes de gravar:
- «A escola já tem «Matemática» (MAT), que é a mesma disciplina» — quando o catálogo
  reconhece o nome escrito como uma disciplina que a escola já tem (grafia, sinónimo);
- o nome do catálogo, se o escrito é diferente;
- o código do catálogo, se o campo está vazio e o código está livre.

Não bloqueia (a escola pode querer «Matemática» e «Matemática A»). Lógica em
`subject-hint.ts`; o `QuickFormModal` ganhou duas opções genéricas e opcionais
(`suggestions` num campo de texto, com `<datalist>` nativo, e `renderHint`).

## Documentos: o nome à data da emissão

O que existe:
- **Pautas:** guardam o nome da disciplina nas linhas (`grade_sheet_rows.subject_breakdown`)
  e têm versões arquivadas (`grade_sheet_versions.snapshot`).
- **Histórico académico:** grava `subject_results` com o nome da altura.
- **Documentos emitidos** (declarações, certificados, boletins, dossiê): são gerados no
  momento a partir dos dados actuais. Cada emissão regista um código de verificação
  (`audit_logs`, `documents.issued`). Esse registo passou a guardar também os **nomes das
  disciplinas tal como saíram impressos** (`printed-subjects.ts`; só nomes, sem notas), e a
  página pública `/verificar` mostra-os.

Assim, um documento emitido antes de corrigir ou juntar uma disciplina continua verificável
com o nome que tinha. Uma reimpressão gera um documento novo, com o nome actual e um código
novo.

## Juntar duplicados

`public.merge_school_subjects(escola, a_manter, a_juntar[])` — migração
`20261010150000_merge_school_subjects.sql`, ensaio `tests/sql/merge-school-subjects.mjs`.

- Uma só transacção. Passa para a disciplina a manter: turmas (`class_subjects`, e com elas
  as pautas e horários, que apontam para a turma-disciplina), currículos, professores,
  disciplinas-chave da avaliação, avaliações, presenças, competências, inscrições em exame e
  planos de aula. As juntas ficam `inactive` — não se apagam.
- Ligações repetidas nas tabelas que só ligam (o mesmo currículo, professor ou regra com as
  duas): fica a da disciplina a manter.
- **Recusa**, sem mexer em nada: as duas na mesma turma (cada uma tem a sua pauta); o mesmo
  aluno no mesmo exame nas duas; competências com o mesmo código no mesmo nível; disciplinas
  em planos do ensino superior (`program_subjects` tem identidade imutável e inscrições por
  cadeira). Qualquer outro erro — o gatilho de período fechado das avaliações, uma restrição
  da produção que o repositório não conhece — desfaz tudo.
- Chamada pelo utilizador (RLS), não pelo servidor privilegiado. A função exige 2FA
  (`is_aal2`) e `academic.subjects.manage`; o servidor exige ainda Administrador/Secretaria e
  só aceita um grupo que a revisão reconhece como a mesma disciplina. Auditado
  (`academic.subject.merged`, com o que mudou).
- Até a migração ser aplicada, o botão responde «falta aplicar a migração 20261010150000…»
  (e a função está em `FUNCOES_ESPERA_MIGRACAO`).

## Importação de dados

- **Disciplinas:** uma linha da folha é dada como «já cadastrada» pelo mesmo código, pelo
  mesmo nome ou pela mesma disciplina do catálogo escrita de outra forma. Antes só o código
  contava: «MATEM | Matemática» numa escola com «MAT | Matemática» criava outra Matemática.
- **Notas, presenças, avaliações:** a disciplina da folha procura-se por código ou nome
  exactos; se nada bater, pela equivalência do catálogo («L. Portuguesa» → «Língua
  Portuguesa»), só por nome, nunca por siglas soltas, e só quando aponta para uma única
  disciplina da escola. Notas e presenças associadas assim ficam com aviso na pré-visualização.
- **Cursos:** o mesmo — código, nome, ou o mesmo curso do catálogo por nome ou sinónimo
  («Ciências Económico-Jurídicas» = «Ciências Económicas e Jurídicas»). Siglas não contam,
  e um nome que serve dois cursos do catálogo («Enfermagem»: técnico e licenciatura) não
  aponta para nenhum (`courseCatalogKey`).
- **Classes (turmas, preçário de propinas):** código ou nome exactos; se nada bater, a mesma
  classe escrita de outra forma («10a classe», «décima classe» → «10ª Classe»), pelo número
  e pela unidade (classe ≠ ano), só quando é uma. Nas turmas fica com aviso.
- **Períodos (notas, avaliações):** além de «1º Trimestre» e «Segundo Trimestre», aceita
  «I Trimestre», «III trimestre» e «T2». Nunca um 4.º período.

## API de pesquisa (Mobile V4, WEB, integrações)

`GET /api/saas/education-catalog/search` (`api.ts`) — a mesma lógica e os mesmos dados do
SIGA, para ninguém manter um catálogo próprio. Pública (só dados de referência), calculada
em memória, CORS para WEB e ADMIN; o Mobile V4 chama-a na mesma origem.

| Pedido | Devolve |
|---|---|
| `type=subjects&stage=AO-ESG2[&course=SEC-CFB][&grade=10][&q=mat]` | disciplinas do nível, as do plano primeiro (`inPlan`: `core`/`optional`/`null`) |
| `type=subjects&isced=6&track=higher[&country=PT][&q=…]` | disciplinas do nível ISCED e via |
| `type=courses[&country=AO][&stage=PT-SEC][&kind=bachelor][&q=enf]` | cursos |
| `type=stages&country=AO` | etapas, classes com rótulo, períodos, escala, cursos, se há plano |

`limit` 1–50 (20 por omissão). Disciplinas sem nível → 400 com a explicação; etapa, curso
ou classe que não existem → 400. Cada resposta leva `version` do catálogo e, por registo, o
estado de verificação e a fonte.

## Governação no ADMIN

ADMIN → **Catálogos globais** (`painel/admin`, `/education-catalog`, só para administradores
da plataforma): totais, cobertura real por país, etapas (filtro por país) e fontes, com o
nível de confiança de cada uma. Lê `GET /api/saas/education-catalog` do SIGA
(`overview.ts`): só dados de referência, sem sessão, como `/api/saas/plans`.

Só consulta, por agora. Aprovar propostas, publicar versões e comparar alterações precisa das
tabelas do catálogo aplicadas na base (`20261010120000`).

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
| Aluno | `EST-000123` (CHECK na base) e código público de 7 dígitos `0000123` | `private.register_student()` |
| Professor | `DOC-000123` (já existia) | ao criar o professor: o seguinte ao **maior** `DOC-n` (`insertWithSequentialCode`) |
| Documento | `<PREFIXO do tipo>-000123` (`FT`, `RC`, … `OT`) | `private.next_document_number()` (já existia) |
| Sala (sugestão no formulário) | continua o padrão da escola (`S01…S07` → `S08`; `LAB-2` → `LAB-3`); sem padrão, `S-001` | `suggestNextCode` |
| Funcionário, turma, curso, disciplina, matrícula | `F-0012`, `T-001`, `C-001`, `D-001`, `M-000123` | `private.next_entity_identifier()` (migração por aplicar; ainda não ligado) |

**Corrigido (2026-10-10):** o número automático do professor era «contagem + 1». Depois de
apagar um professor, ou com um número escrito à mão, repetia um número existente e a
restrição `teachers_school_id_employee_number_key` fazia falhar a criação. Agora segue o
maior existente e, se outro pedido gravou o mesmo número ao mesmo tempo, tenta o seguinte
(até 5 vezes). Vale para «Novo professor» e para a ficha criada ao vincular a conta.

UUID continua a ser a chave primária. Os códigos não são credenciais e não vão em URLs
públicas de dados pessoais.

## Aplicar (dono, SQL Editor) — não aplicado

1. `supabase/migrations/20261010120000_global_education_catalog.sql` (idempotente; tabelas
   novas, nenhuma alteração a tabelas existentes).
2. `supabase/seeds/education/catalog.sql` (idempotente).
3. `supabase/migrations/20261010150000_merge_school_subjects.sql` (só cria a função).
4. Recapturar o retrato (`npm run siga:db-snapshot`) e tirar `merge_school_subjects` de
   `FUNCOES_ESPERA_MIGRACAO` (`tests/security/espera-migracao.ts`).

Ensaio local: `SIGA_SQL_TEST_MODULE_PATH=<…/pglite/dist/index.js> node tests/sql/education-catalog.mjs`
— migração e carga duas vezes, contagens iguais, chaves estrangeiras, estados, anon sem
acesso, authenticated só lê, sequências sem repetir.

A página e a pesquisa **não** dependem destas tabelas (usam os dados empacotados), por isso
não há nada em `TABELAS_AUSENTES_DA_PRODUCAO`.

## Próximas fases

- ~~Assistente de estrutura para Moçambique e Portugal~~ (feito, ver acima).
- ~~Juntar duplicados~~ (feito; falta aplicar a migração).
- Ligar `subjects.catalog_subject_code` e `programs.catalog_course_code` (colunas novas, por
  `ALTER TABLE`) e usar `findSubjectDuplicates` para propor fusões com mapeamento auditado.
- Documentos e pautas a resolverem nomes pelo catálogo (mantendo o nome à data da emissão).
- Painel de governação no ADMIN (aprovar propostas, versões, comparar, restaurar) com
  `catalog_review_queue`.
- Conferir os planos com os documentos oficiais e passar a «Oficial verificado».
- Mobile V4: consumir `catalog.ts` (o mesmo módulo), sem catálogo próprio.
