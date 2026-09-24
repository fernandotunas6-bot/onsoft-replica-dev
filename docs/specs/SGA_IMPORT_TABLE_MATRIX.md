# SGA — Matriz Governada de Importação/Exportação

**Atualização:** 2026-09-24

## Catálogo vivo

A tabela `public.import_table_specs` acompanha o schema público do SGA e contém uma linha por tabela pública.

Estado actual:
- 157 tabelas públicas, incluindo o próprio catálogo;
- 157/157 com RLS;
- 157 especificações;
- 46 tabelas classificadas como `controlled`;
- 12 como `deny`;
- 99 como `review`;
- 149 com grafo de FKs detectado;
- 90 com uma candidate unique key detectada.

> O catálogo é conservador: `review` significa que a tabela ainda exige validação do fluxo funcional antes de ser autorizada para importação directa.

## Políticas

### controlled
A escrita é permitida apenas através do motor de importação, com:
- escola/tenant correcto;
- resolução de FKs;
- validação de regras;
- duplicate strategy;
- auditoria;
- rollback quando reversível.

### deny
Nunca aceitar escrita directa pelo ficheiro do utilizador. Exemplos:
- `school_integration_secrets`;
- tokens;
- OTPs;
- logs/auditorias;
- eventos de webhook;
- assinaturas;
- auditoria de privacidade.

### review
Não assumir que uma tabela é importável só porque existe no PostgreSQL. A equipa deve confirmar:
- se é dado de negócio;
- se é derivado;
- se possui UI/importador;
- se pode ser recalculado;
- quais são as regras de autorização;
- qual é a chave natural.

## Grafo de dependências

O catálogo lê as FKs do schema vivo e guarda:
- colunas de origem;
- tabela destino;
- colunas destino.

Também captura uma candidate unique key quando disponível. Isto é uma pista para matching, não uma autorização automática de upsert.

## Ordem

O motor deve construir o plano a partir das dependências reais. A ordem base continua:

`school/context → people → identities → academic structure → subjects → classes → class_subjects → enrollments → timetable → attendance → assessment → grades → finance → history → derived data`

Se uma FK exigir outra dependência, o grafo do SGA prevalece sobre a ordem acima.

## Regra de segurança

O catálogo está com RLS + FORCE RLS e sem policy de cliente. O acesso deve ser server-side pelo motor de importação.

Não devem ser criadas policies genéricas apenas para reduzir avisos do Security Advisor.

## Regra de compatibilidade

O catálogo não substitui as tabelas de negócio e não altera IDs existentes. Ele funciona como camada de governança para o Import/Export Premium.


## Auditoria cruzada dos 22 importadores — 2026-09-24

O motor passou a ter um contrato explícito `IMPORTER_TARGET_TABLES` para os 22 módulos. Antes de criar um job e novamente antes de cada lote de commit, o servidor consulta o catálogo vivo `import_table_specs`.

Critérios de bloqueio:
- tabela ausente no catálogo;
- `active = false`;
- `direct_import_policy` diferente de `controlled`;
- sensibilidade `secret` ou `internal`.

Resultado da reconciliação live: **0 alvos fora da governança** entre os 22 módulos.

Correção de segurança relevante:
- `funcionarios` deixou de escrever em `person_roles`, que é uma tabela de papéis institucionais protegida contra escrita por clientes;
- `funcionarios` agora grava `people` + `hr_positions` + `hr_employments`;
- `person_roles` permanece fora do conjunto de tabelas importáveis;
- `school_billing_settings` foi explicitamente autorizado como `controlled`, pois contém apenas parâmetros operacionais de cobrança e não segredos.

O contrato também exige `hire_date` no modelo humano de funcionários; não é inventada uma data para completar dados ausentes.

## Integridade do job Premium

`createImportJob` agora persiste no SGA:
- `schema_version`;
- `exchange_mode`;
- `source_format`;
- `dry_run`;
- `idempotency_key`;
- `manifest`;
- `dependency_plan`.

A chave de idempotência é validada por escola e não pode ser reutilizada para outro módulo.


## Auditoria de campos e bidireccionalidade — 2026-09-24

A auditoria campo-a-campo encontrou divergências que foram tratadas antes de considerar o intercâmbio seguro:

### Correções aplicadas

- **inscricoes**: o importador estava a transformar candidaturas em registos de `students`, enquanto o exportador usava `enrollment_applications`. O importador foi alinhado ao modelo real de candidaturas.
- **presencas**: o importador estava a gravar apenas `enrollments.attendance_rate`, apesar do modelo humano pedir data, turma, disciplina e estado. Foi alinhado ao modelo SIGA real:
  `siga_attendance_sessions` + `siga_attendance_records`.
- **pautas** e **presencas**: alterações passaram a produzir auditoria reversível com `before_data` e `after_data`.
- **classes, cursos, disciplinas, salas, avaliações, horários e inscrições**: inserções relevantes passaram a gerar entradas em `import_audits`.
- **histórico académico**: actualizações agora capturam o registo anterior antes de escrever e deixam de declarar sucesso quando a persistência falha.
- **exportação**: o motor não pode mais gerar silenciosamente um Excel parcial. Se um módulo selecionado ainda não possuir exportador bidireccional validado, a exportação é bloqueada em vez de produzir um ficheiro potencialmente enganoso.
- **presenças** já possuem exportação validada no mesmo modelo usado pela importação.

### Exportação ainda em implementação

Neste momento, os seguintes módulos ainda não têm exportação bidireccional validada e, por segurança, ficam bloqueados quando selecionados:

- encarregados
- funcionários
- classes
- cursos
- salas
- horários
- notas
- pautas
- dívidas

Isto é intencional: **é preferível bloquear uma exportação incompleta do que entregar um ficheiro que, ao ser reimportado, perca dados ou altere a estrutura do SGA.**

### Regra de ouro

Nenhum campo do Excel deve ser tratado como "apenas visual". Cada campo deve ter uma destas situações documentadas:

1. persistência directa;
2. resolução para uma FK existente;
3. geração derivada determinística;
4. preservação em payload/metadata explicitamente documentada;
5. rejeição explícita com motivo.

Campos sem uma destas cinco situações não devem ser considerados parte do contrato Premium.
