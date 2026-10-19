# Motor D — base de dados: diagnóstico medido

**Data:** 2026-10-19 · **Âmbito:** consultas, índices, RPC, RLS e Realtime na produção
(`xodgfmxiaunpamctfeea`) · **Escrita feita:** nenhuma. Só leitura.

Este relatório cobre a fatia de base de dados da Operação Performance Total. A fatia
de interface (router, pré-busca, listas, realtime do lado do cliente) está a ser feita
em paralelo e tem inventário próprio em `inventory-before.json` e `bundle-before.json`.

## O achado principal: não há gargalo para medir

| Medida | Valor |
| --- | --- |
| Período de recolha (`pg_stat_statements`) | 2 090,5 h — 87 dias, desde 2026-07-24 |
| Tempo de execução de **toda** a base nesse período | **4 494 s** |
| Em fracção de um CPU | **0,06 %** |
| Chamadas totais | 1 150 242 |
| Tamanho da base | 55 MB |
| Tabelas em `public` | 207, das quais **101 vazias** |
| Linhas em todas as tabelas somadas | 37 770 |

A base está parada. Em 87 dias gastou menos de hora e meia de CPU. **Qualquer ganho
medido neste volume seria ruído**, e é por isso que este relatório não anuncia ganho
nenhum: não há antes-e-depois honesto a fazer aqui.

Isto liga-se ao que já se sabia: das 48 escolas, a esmagadora maioria são restos de
testes E2E; o uso real é de uma escola. 85 alunos, 76 matrículas, 38 facturas.

## O que os avisos do Supabase dizem — e porque não são uma lista de trabalho

O *performance advisor* devolve **439 avisos**, em dois tipos. Nenhum dos dois se deve
seguir tal como vem.

### 230 «índices nunca usados»

`unused_index` compara com as estatísticas de uso. Numa base sem tráfego, **todos os
índices parecem inúteis**. Apagá-los com este fundamento seria apagar à sorte. Descartado.

### 209 «chaves estrangeiras sem índice»

Esta merece ser aberta, e ao abri-la muda de significado. Das 204 que contei pela mesma
regra:

| Natureza da coluna | Quantas | Vale a pena indexar? |
| --- | --- | --- |
| Auditoria — `created_by`, `updated_by`, `issued_by`, `actor_user_id`… | **188** | **Não.** Ninguém pergunta «que matrículas criou o utilizador X». Um índice aqui é escrito em cada inserção e lido nunca. |
| Catálogo global/país — `subject_code`, `isced_level`, `source_id`… | 12 | Marginal. Tabelas limitadas (máx. 614 linhas) e só de leitura. |
| **Referência que cresce por aluno** | **4** | **Sim**, por antecipação. |

As quatro: `class_group_waitlist.student_id`, `class_group_waitlist.class_group_id`,
`student_scholarships.student_id`, `student_special_statuses.student_id`. Estão todas a
zero hoje, mas crescem uma linha por aluno quando as funcionalidades forem usadas.

**Aplicado à produção a 2026-10-19** e confirmado em `pg_indexes`. Migração
`20261019112536_growth_foreign_key_indexes.sql`; pacote em
[`docs/agents/SIGA_aplicar_indices_crescimento.sql`](../../agents/SIGA_aplicar_indices_crescimento.sql).

**Seguir os 209 avisos à letra tornaria as escritas mais lentas sem acelerar leitura
nenhuma.** É o contrário de uma optimização.

## RLS: já está bem feito

Os dois problemas clássicos de desempenho de RLS no Supabase **não existem aqui**:

| Verificação | Resultado |
| --- | --- |
| Políticas em `public` | 370 |
| Que usam `auth.uid()` | 31 |
| **Com `auth.uid()` por envolver em `(SELECT …)`** | **0** |
| Tabelas a acumular políticas permissivas de SELECT/ALL | **0** |
| Funções de permissão (`has_permission`, `is_school_member`, `is_school_staff`, `sga_app_role`…) | todas `STABLE` |

Nota de método: a primeira passagem acusou 3 políticas por envolver. Era falso — usei
`!~` (sensível a maiúsculas) a procurar `select` em texto que guarda `SELECT`. Com `!~*`
o resultado é zero. Fica registado porque o erro ia gerando uma migração desnecessária.

## Realtime: 56,5 % do tempo, que continua a ser pouco

O descodificador WAL do Realtime (`realtime.list_changes`) é a consulta mais cara da base:

- 381 836 chamadas, **2 540 s** — **56,5 %** de todo o tempo de execução.
- 6,65 ms por chamada.
- Publicação `supabase_realtime`: 10 tabelas.
- Escritas nessas 10 tabelas em 87 dias: **735 linhas**.
- Subscrições activas no momento da medição: **0**.

Lido sozinho, «56,5 % do tempo da base» parece o gargalo. Lido com o denominador, são
2 540 s em 87 dias — **0,03 % de um CPU**. O custo é de sondagem periódica, não de
trabalho útil, e hoje não dói. Fica aqui porque é o primeiro item que cresce quando
houver escolas a sério: é custo por alteração e por subscritor, e passa a contar quando
as 10 tabelas publicadas tiverem movimento real.

Sem acção proposta agora. Se o Realtime continuar sem uso, a decisão de reduzir a
publicação é de produto, não de desempenho.

## Consultas N+1 no código servidor

Varri `src/features/**/server*.ts` por consultas dentro de ciclos (18 candidatos, por
contagem de chavetas e não por `grep`). A maioria é **correcta por desenho** e não se deve
tocar:

| Sítio | Veredicto |
| --- | --- |
| `students/server.ts:1675` — matrícula em lote | Série **deliberada**: «cada chamada tranca a mesma turma». Paralelizar daria contenção. |
| `import/server.ts:511` — commit linha a linha | A marcação por linha é o que **impede importar o mesmo aluno duas vezes**. Agrupar partia a segurança a meio de uma falha. |
| `higher-ed/server.ts:2574`, `import/server.ts:279`, `chat-server.ts:186` | Já são lotes (300, `CHUNK`, concorrência limitada). |
| `finance/server.ts:1240` | Ciclo de tentativas, limitado a 5. |
| `arquivos/server.ts:843` | Sobe a árvore de pastas, limitado a 12 níveis. |

**Um gargalo real — CORRIGIDO:** `exportSisiesWorkbook`, no bloco dos graduados. Fazia
`loadPlan()` (que são **3** consultas) mais uma leitura de `course_unit_enrollments` com
`.limit(50000)` **por cada curso**: 4 consultas por curso, 120 com 30 cursos, e até 1,5 M
de linhas trazidas para memória para montar uma folha de Excel.

| | Antes | Depois |
| --- | --- | --- |
| Planos dos cursos | 3 consultas × N cursos | **2**, com `loadPlanUnitsByProgram` |
| Inscrições em cadeiras | 1 consulta × N cursos | páginas de 1000 até acabarem |
| Com 30 cursos | **120 consultas** | **2 + nº de páginas** |

O `.limit(50000)` por curso era também um corte em silêncio: uma escola com mais de 50 000
inscrições num curso perdia linhas sem aviso, e o número de graduados saía errado. A
paginação com `.order("id")` fixo tira o tecto e torna a contagem correcta.

Guarda em `tests/higher-ed/server-guards.test.ts` («graduados sem uma consulta por curso»):
recusa o regresso do `loadPlan(` ao corpo da exportação e exige a paginação ordenada.

## Sobre-leitura

Estreitar colunas às cegas é perigoso: quem leia um campo que deixou de vir parte em
silêncio, sem erro de tipos, porque a linha continua a existir. Por isso medi em vez de
mudar tudo — cruzei os 41 destinos de `select("*")` com a largura real das tabelas.

| Tabela | Colunas | Das quais jsonb/text | Linhas hoje |
| --- | --- | --- | --- |
| **`import_rows`** | 17 | **11** | **4 400** |
| `people` | 22 | 13 | 529 |
| `tenant_billing_profiles` | 36 | 16 | 0 |
| `class_groups` | 19 | 6 | 48 |

Só uma junta tabela larga, muitas linhas e caminho em massa: **`import_rows`**, no ciclo
de importação. Lia as 17 colunas — incluindo `raw_data`, `errors`, `warnings` — quando o
ciclo usa **três**: `id`, `row_number` e `normalized_data`. Verifiquei todos os acessos a
`row.` no âmbito e os usos de `pendingRows` antes de mudar. Com `*`, cada lote trazia o
ficheiro importado outra vez para memória. **Corrigido.**

As outras 97 ficam como estão, de propósito: tabelas pequenas onde o ganho não paga o
risco de partir uma leitura em silêncio.

## Como obter medições a sério

Nada disto se resolve a medir a produção como está. Para um antes-e-depois honesto é
preciso volume representativo — uma escola com milhares de alunos, matrículas, notas e
facturas — e medir aí, com `EXPLAIN (ANALYZE, BUFFERS)` nas consultas dos ecrãs mais
pesados. Enquanto a produção tiver 85 alunos, o plano óptimo para quase tudo é o
varrimento sequencial, e o Postgres tem razão.

## Riscos e limitações

- Mediu-se **só** a base de dados. Latência de rede, Workers da Cloudflare e tempo de
  render não entram aqui.
- `pg_stat_statements` agrega 87 dias, que incluem as corridas E2E. Os números servem
  para comparar entre si, não para caracterizar um dia de uso real — que não existe.
- As quatro tabelas que justificam índice estão vazias: o ganho é por antecipação, e
  não há como o medir hoje.
