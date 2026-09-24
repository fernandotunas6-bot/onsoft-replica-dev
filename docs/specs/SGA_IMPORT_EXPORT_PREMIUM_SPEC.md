# SGA — Especificação Premium de Importação/Exportação (v1)

**Data:** 2026-09-24  
**Base de referência:** SGA `xodgfmxiaunpamctfeea`  
**Estado auditado:** 156 tabelas públicas, 515 FKs, RLS activo em 156/156 tabelas.

## 1. Objetivo

O motor deve aceitar dados escolares reais, inclusive planilhas antigas e formatos de troca SIGA, sem destruir dados existentes, IDs, relações ou funcionalidades.

O fluxo canónico é:

**Ficheiro → Parser → Detecção → Normalização → Mapping → Resolução de referências → Validação → Duplicados → Plano de dependências → Preview/Dry-run → Commit transaccional → Auditoria → Relatório → Reimportação segura**

## 2. Contrato de módulos

Os 22 módulos actualmente implementados são:

1. pessoas
2. alunos
3. encarregados
4. professores
5. funcionarios
6. turmas
7. classes
8. cursos
9. disciplinas
10. salas
11. matriculas
12. inscricoes
13. horarios
14. notas
15. avaliacoes
16. pautas
17. presencas
18. propinas
19. pagamentos
20. dividas
21. historico_academico
22. historico_financeiro

Um módulo só é considerado suportado quando possui importador real no `IMPORTER_REGISTRY`. Declarar um módulo no selector não pode simular suporte.

## 3. Modos

### `human`
Formato orientado a utilizadores não técnicos:
- cabeçalhos legíveis;
- aliases em português/inglês;
- exemplos;
- validações visuais;
- resolução automática de referências;
- preview antes de gravar.

### `siga_exchange`
Formato estável para exportar → editar externamente → reimportar:
- IDs preservados quando presentes;
- chaves naturais como fallback;
- checksum/hash;
- versão do contrato;
- manifesto;
- dependências;
- estratégia de duplicados;
- sem incluir segredos.

## 4. Contrato do job

`import_jobs` passa a guardar:
- `schema_version`;
- `exchange_mode`;
- `source_format`;
- `dry_run`;
- `idempotency_key`;
- `manifest`;
- `dependency_plan`;
- `error_summary`.

A chave de idempotência é única por escola quando fornecida. Reprocessar o mesmo lote não deve criar duplicados.

## 5. Contrato da linha

`import_rows` passa a suportar:
- `natural_key`;
- `natural_key_hash`;
- `validation_stage`;
- `resolution`;
- `source_hash`.

A resolução deve distinguir:
- correspondência exacta;
- correspondência por chave natural;
- correspondência ambígua;
- referência inexistente;
- criação automática permitida;
- criação automática proibida.

## 6. Templates

`import_templates` é versionado e contém:
- módulo;
- modo;
- versão;
- cabeçalhos;
- mappings;
- tabelas alvo;
- dependências;
- checksum;
- indicação de template de sistema.

Um template antigo continua válido para o seu `version`; nunca deve ser alterado silenciosamente.

## 7. Auditoria e rollback

`import_audits` deve registar:
- job;
- linha;
- tabela alvo;
- ID alvo;
- operação;
- estado anterior;
- estado posterior;
- ordem da operação;
- hash de origem;
- se a operação é reversível.

Rollback deve operar apenas sobre alterações pertencentes ao job, respeitando dependências e sem apagar dados pré-existentes que não foram criados pelo lote.

## 8. Regra crítica: 156 tabelas ≠ 156 tabelas importáveis

O SGA possui tabelas de:
- dados mestre;
- dados transaccionais;
- dados derivados;
- auditoria;
- segurança;
- integrações;
- secrets;
- filas/provisionamento;
- caches/índices funcionais.

O exportador pode produzir um **manifesto completo**, mas o importador não deve escrever cegamente em todas as tabelas.

### Nunca importar directamente
- `school_integration_secrets`;
- tabelas privadas de sequências;
- logs de segurança/auditoria como dados de negócio;
- tabelas derivadas quando o sistema as consegue recalcular;
- tokens e segredos;
- tabelas internas de infraestrutura.

### Importar através de relações
Dados como alunos, professores, turmas, disciplinas, matrículas, horários, presenças, avaliações, notas e finanças devem ser resolvidos pelas FKs e chaves naturais, não por nomes de tabelas enviados pelo utilizador.

## 9. Ordem de dependências recomendada

1. escola/contexto
2. pessoas
3. alunos/professores/funcionários
4. níveis/classes/cursos
5. disciplinas
6. salas
7. turmas
8. relações turma-disciplina
9. matrículas/inscrições
10. horários
11. presenças
12. avaliações
13. notas/pautas
14. propinas/contratos
15. pagamentos/dívidas
16. históricos
17. módulos derivados e relatórios

A ordem real deve ser construída a partir das FKs do SGA e confirmada antes do commit.

## 10. Critérios de aceitação

Um lote só pode chegar a `completed` quando:
- todas as referências obrigatórias foram resolvidas;
- não existem erros de schema/coluna/tipo/UUID;
- não existem FKs inválidas;
- a estratégia de duplicados foi aplicada;
- o plano foi executado na ordem correcta;
- a auditoria foi gravada;
- as contagens finais batem com as linhas processadas;
- o reprocessamento com a mesma chave é idempotente.

## 11. Regra de compatibilidade

Nenhuma evolução desta especificação pode:
- remover tabelas;
- remover colunas existentes;
- alterar IDs existentes;
- quebrar FKs;
- substituir os modelos `grade_*`/SIGA ou `attendance_*`/SIGA;
- incorporar Zoom no título da aula.

As alterações de schema devem ser incrementais, versionadas e compatíveis com os dados actuais.
