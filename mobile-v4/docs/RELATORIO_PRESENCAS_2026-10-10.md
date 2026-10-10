# Mobile V4 — calendário e presenças canónicas, 10/10/2026

Continuação da PR #116 sobre `e551d784`. Código destinado exclusivamente ao preview `staging-mobile-v4-pr116`; o estado e commit exacto da publicação são registados na descrição actual da PR.

## Funcionalidades deste ciclo

- Endpoint HTTP autenticado `GET /api/mobile-v4/schools/:schoolId/attendance?role=aluno|professor&from=YYYY-MM-DD&to=YYYY-MM-DD`, com intervalo obrigatório de até 31 dias. Identidade, MFA, vínculo e âmbito académico são validados no servidor. IDs de alunos enviados na URL não decidem autorização.
- Leitura das chamadas existentes em `siga_attendance_sessions` e marcações de `siga_attendance_records`. Alunos recebem apenas as próprias marcações nas disciplinas das suas matrículas activas; professores recebem somente chamadas atribuídas ao próprio docente e alunos da turma autorizada.
- Marcações de chamadas pendentes/canceladas não são publicadas. Não se deduz uma falta da ausência de marcação, nem uma aula de um slot do horário.
- Ocorrências próprias do professor em `hr_teacher_lesson_occurrences`, separadas da chamada dos alunos. Só seis campos académicos são seleccionados; não são lidos salários, contratos, notas internas ou justificações. Estados prevista/confirmada/rejeitada/cancelada são preservados, sem converter rejeição em falta.
- Calendário mensal com cores, navegação por teclado, selecção do dia, detalhe da chamada e actualização. Usa os ícones e classes CSS existentes. Respostas anteriores a mudança de mês/escola/conta são descartadas; 401/403 limpa o contexto institucional.
- Contrato estrito validado no servidor e no browser: escola/papel/período, disciplinas, próprio aluno, docente, datas/horas, duplicados, estados e campos adicionais. Consultas truncadas ou incoerentes falham sem resultados parciais.

## Verificação

- 117 testes Mobile e 72 testes seleccionados backend/RLS aprovados.
- 39 verificações em PostgreSQL local PGlite, executando as funções reais de resolução de âmbito e projecção, com SQL parametrizado e dados exclusivamente de ensaio. Incluem outra escola, colegas, docentes diferentes, chamadas pendentes, ano anterior, registos eliminados e respostas truncadas/indisponíveis.
- Metadados e restrições das três tabelas consultados no Sga através de SELECT ao catálogo, sem ler registos pessoais. Horas docentes são `time without time zone`; horas das chamadas são texto nullable. Os fixtures foram alinhados com esses tipos reais.
- TypeScript raiz/Mobile, lint/formatação, build raiz, builds Mobile/PWA/módulo/Worker e verificador PWA aprovados. A validação publicada do CI será confirmada na PR.
- Ensaios de interface/SQL usam dados controlados locais e não demonstram login remoto positivo, MFA de contas reais, renovação real nem produção RLS.

## Limites

Só consulta, em disciplinas/anos/matrículas actualmente activos. Ocorrências históricas de disciplinas já não atribuídas não entram neste âmbito. Consultas com mais de 1000 linhas por leitura são recusadas; paginação ainda pendente. Justificações, pedidos de alteração e escrita de chamada não estão implementados neste Mobile.

Continuam pendentes notas, planos completos, submissões, chat, notificações, documentos/ficheiros, comandos transaccionais com auditoria/idempotência e percursos com contas reais autorizadas. Não se declara o Mobile integralmente funcional.

Não houve alteração de esquema, migração, escrita de dados na base Sga ou publicação do portal principal.
