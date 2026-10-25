# SPECs do SIGA Plus

Actualizado a 8 de Outubro de 2026. Referência: banco SGA existente, snapshot de 189 tabelas capturado a 06/10 e catálogo consultado a 07/10; não uma base alternativa.

**Implementado** descreve código presente, não certificação funcional. **Proposto** descreve trabalho ainda sem prova de aceitação. **Por decidir** exige regra institucional, credencial, fornecedor ou infra-estrutura. Migrações preparadas não são produção actual.

As SPECs de módulo abaixo completam as especificações temáticas anteriores, que conservam as suas datas históricas. Fonte de estados/colunas: `supabase/PRODUCTION_SNAPSHOT.json`; fonte de campos/validações: schemas ligados em cada módulo. Uma página ou um teste mock não prova UI→API→persistência real.

[Regras transversais](CONTRATOS_TRANSVERSAIS.md) · [Alterações críticas e aceitação](CORRECCOES_2026-10-08.md) · [Progresso](../implementation/2026-10-07/PROGRESSO.md) · [Matriz](matriz-evolucao.csv) · [Contratos API inventariados](contratos-api.csv)

| Módulo                                        | SPEC                                        | Estado de validação             |
| --------------------------------------------- | ------------------------------------------- | ------------------------------- |
| Avaliações, presenças, notas e pautas         | [academic](modules/academic.md)             | Parcial; ver provas e bloqueios |
| Contas, vínculos e permissões                 | [access](modules/access.md)                 | Parcial; ver provas e bloqueios |
| Assistência pedagógica                        | [ai-assist](modules/ai-assist.md)           | Parcial; ver provas e bloqueios |
| Antigos alunos e portefólios                  | [alumni](modules/alumni.md)                 | Parcial; ver provas e bloqueios |
| Arquivos escolares                            | [arquivos](modules/arquivos.md)             | Parcial; ver provas e bloqueios |
| Auditoria e rastreabilidade                   | [audit](modules/audit.md)                   | Parcial; ver provas e bloqueios |
| Autenticação e contexto escolar               | [auth](modules/auth.md)                     | Parcial; ver provas e bloqueios |
| Ano e calendário lectivo                      | [calendar](modules/calendar.md)             | Parcial; ver provas e bloqueios |
| Catracas e cartões de acesso                  | [catracas](modules/catracas.md)             | Parcial; ver provas e bloqueios |
| Comunicação institucional                     | [communications](modules/communications.md) | Parcial; ver provas e bloqueios |
| Contactos e relações                          | [contacts](modules/contacts.md)             | Parcial; ver provas e bloqueios |
| Painéis e portais por perfil                  | [dashboard](modules/dashboard.md)           | Parcial; ver provas e bloqueios |
| Documentos, modelos e exportações             | [documents](modules/documents.md)           | Parcial; ver provas e bloqueios |
| Candidatura e matrícula pública               | [enrollment](modules/enrollment.md)         | Parcial; ver provas e bloqueios |
| Tesouraria escolar                            | [finance](modules/finance.md)               | Parcial; ver provas e bloqueios |
| Ensino superior                               | [higher-ed](modules/higher-ed.md)           | Parcial; ver provas e bloqueios |
| Recursos humanos e salários                   | [hr](modules/hr.md)                         | Parcial; ver provas e bloqueios |
| Importações e exportação de intercâmbio       | [import](modules/import.md)                 | Parcial; ver provas e bloqueios |
| Integrações e capacidades                     | [integrations](modules/integrations.md)     | Parcial; ver provas e bloqueios |
| Indicadores e inteligência escolar            | [intelligence](modules/intelligence.md)     | Parcial; ver provas e bloqueios |
| Planos de aula                                | [lesson-plans](modules/lesson-plans.md)     | Parcial; ver provas e bloqueios |
| Mensagens internas                            | [messages](modules/messages.md)             | Parcial; ver provas e bloqueios |
| Notificações e preferências                   | [notifications](modules/notifications.md)   | Parcial; ver provas e bloqueios |
| Códigos de autenticação                       | [otp](modules/otp.md)                       | Parcial; ver provas e bloqueios |
| Estrutura académica, turmas e horários        | [pedagogica](modules/pedagogica.md)         | Parcial; ver provas e bloqueios |
| Registo central de pessoas                    | [people](modules/people.md)                 | Parcial; ver provas e bloqueios |
| Provisionamento e administração da plataforma | [saas](modules/saas.md)                     | Parcial; ver provas e bloqueios |
| Configuração institucional                    | [school](modules/school.md)                 | Parcial; ver provas e bloqueios |
| Pesquisa e atalhos de trabalho                | [spotlight](modules/spotlight.md)           | Parcial; ver provas e bloqueios |
| Alunos, matrícula interna e renovação         | [students](modules/students.md)             | Parcial; ver provas e bloqueios |

## Aplicações e operação

- [WEB, ADMIN, PAYFLOW e DOC](ECOSSISTEMA_APPS.md)
- [Desktop, PWA e offline](DESKTOP_PWA.md)
- [Jornada anual e gates de publicação](JORNADA_INTEGRADA.md)
- [Biblioteca, capelania e lacunas de âmbito](LACUNAS_E_DECISOES.md)

## SPECs temáticas anteriores

- [SGA_ACADEMIC_EVIDENCE_PERSISTENCE_STAGING.md](SGA_ACADEMIC_EVIDENCE_PERSISTENCE_STAGING.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [SGA_ACADEMIC_TIME_SHIFTS_BREAKS_GATE_SPEC.md](SGA_ACADEMIC_TIME_SHIFTS_BREAKS_GATE_SPEC.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [SGA_ANGOLA_LESSON_PLANS_ASSESSMENTS_2026.md](SGA_ANGOLA_LESSON_PLANS_ASSESSMENTS_2026.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [SGA_GATE_QR_LESSON_ATTENDANCE_PAYROLL_SPEC.md](SGA_GATE_QR_LESSON_ATTENDANCE_PAYROLL_SPEC.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [SGA_IMPORT_EXPORT_PREMIUM_SPEC.md](SGA_IMPORT_EXPORT_PREMIUM_SPEC.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [SGA_IMPORT_TABLE_MATRIX.md](SGA_IMPORT_TABLE_MATRIX.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [SGA_SECURITY_ACCESS_SPEC.md](SGA_SECURITY_ACCESS_SPEC.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [SGA_TIMETABLE_PUBLICATION_UX_SPEC.md](SGA_TIMETABLE_PUBLICATION_UX_SPEC.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [SIGA_MOBILE_DESIGN_SYSTEM.md](SIGA_MOBILE_DESIGN_SYSTEM.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
- [motor-academico-estado.md](motor-academico-estado.md) — conservar a data/contexto próprios; o índice não transforma proposta em implementação.
