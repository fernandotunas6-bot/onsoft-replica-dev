# Promessa vs produto — reconciliação das 82 verificações

**Data:** 2026-09-25 · **Âmbito:** áreas 1 a 9 (60 verificações). As áreas 10 a 12 ainda
não foram auditadas e estão assinaladas como tal — não são avaliadas de cor.

O plano de auditoria lista 82 verificações. Este documento responde a uma pergunta
diferente da dos relatórios por área, e mais básica: **de cada verificação, existe
alguma coisa?**

A pergunta ganhou peso porque o mesmo engano apareceu quatro vezes, nas áreas 5, 6, 7 e 9:
uma tabela bem desenhada em produção, às vezes povoada, que **nenhuma linha de código lê**.
Quem leia o esquema conclui que a funcionalidade existe. Não existe.

## Como se responde, e o que a resposta vale

Os factos de tabela vêm de `npm run siga:inventario`
(`scripts/siga/inventario-promessa-vs-produto.mjs`), que cruza três coisas: a tabela está
no retrato de produção, tem linhas, e é referida em `src/`. A saída está em
`inventario-promessa-vs-produto.md` e **regenera-se** — não é uma fotografia para
envelhecer numa pasta.

O limite do método está escrito no cabeçalho do script e repete-se aqui porque muda a
leitura: **a detecção de uso é textual**. Uma tabela alcançada só por vista, trigger ou
corpo de função aparece como sem leitor sem o ser. Por isso nada abaixo foi classificado
só pelo script — cada caso marcado *sem leitor* ou *ausente* foi confirmado à mão, e a
confirmação está citada.

### Vocabulário

| Veredicto | Significa |
|---|---|
| **existe** | implementado e alcançável pela aplicação |
| **parcial** | existe uma parte; a que falta está dita |
| **esquema só** | tabela e/ou função na base, **sem código que lhes toque** |
| **ausente** | nem tabela nem código |
| *por auditar* | área 10–12, ainda não analisada |

---

## O retrato em números

De 162 tabelas de produção:

| | Tabelas | |
|---|---:|---|
| viva | 72 | código e dados |
| sem dados | 63 | há código, não há linhas — por estrear |
| **sem leitor** | **7** | **há linhas e nenhuma referência em `src/`** |
| órfã | 20 | nem código nem dados |

As 7 sem leitor são: `reserved_subdomains` (40 linhas), **`notifications` (16)**,
`module_catalog` (8), `school_modules` (8), `announcements` (2), `financial_rule_sets` (1),
`grading_scales` (1).

Entre as 20 órfãs estão, agrupadas por aquilo que prometiam: o ciclo documental
(`issued_documents`, `document_signatures`), o ciclo das pautas (`grade_sheets`,
`grade_sheet_rows`, `report_cards`), o modelo de presenças anterior
(`attendance_sessions`, `attendance_records`, `attendance_session_roster`) e a camada de
correio (`mailboxes`, `email_aliases`).

---

## Área 1 — Autenticação e segurança (7)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 1.1 | Login, sessões, expiração, encerramento | existe | `features/auth/`, OTP multicanal |
| 1.2 | Recuperação de senha, links expirados, identidade | existe | `reset-password-server.ts` com `fetchSchoolBranding` |
| 1.3 | MFA/2FA, limites, força bruta, enumeração | existe | `is_aal2()` exigido em `register_payment`/`reverse_receipt`; limites em OTP e webhook |
| 1.4 | RBAC granular por perfil | existe | `permissions`/`role_permissions`; `private.has_permission` |
| 1.5 | Isolamento multi-tenant | parcial | 7 tabelas fechadas nesta auditoria; **3 políticas largas por fechar** |
| 1.6 | Bloqueio por alteração de URL/ID/parâmetro | parcial | RLS sim; mas **359 chamadas ao cliente de serviço em 84 ficheiros** contornam-na por desenho |
| 1.7 | Auditoria de alterações e protecção de segredos | parcial | `audit_row_change` em 42 tabelas; **`student_academic_history` não é uma delas** |

## Área 2 — Gestão institucional e multi-tenant (6)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 2.1 | Criação de instituições, ano lectivo, níveis | existe | `saas/`, `school-bootstrap.ts` |
| 2.2 | Domínios, subdomínios, planos, subscrições | parcial | `tenant_domains` vive; **`slug_reservations` e `subscription_addons` órfãs** |
| 2.3 | Províncias, turnos, cursos, calendário | parcial | existe; **`school_shift_slots` órfã** |
| 2.4 | Activação, suspensão, eliminação sem afectar outros | existe | `platform-ops.ts` |
| 2.5 | Configurações por instituição e administração global | existe | `school_settings` por domínio |
| 2.6 | Importação e exportação segura, segregação de ficheiros | existe | `import/`, `export-engine.ts`, `siga_files` fechada |

## Área 3 — Pessoas, matrículas e transferências (7)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 3.1 | Cadastro e duplicados | existe | `people/`, `students/` |
| 3.2 | ID sequencial de 7 dígitos por escola | existe | `student_number` |
| 3.3 | Matrículas, rematrículas, mudanças de turma | existe | `enrollments` |
| 3.4 | Transferências e histórico | parcial | `student_academic_history` existe; **só o importador a escreve** |
| 3.5 | Vagas, idades, pré-requisitos, conflitos | parcial | capacidade sim; equivalências não localizadas |
| 3.6 | Importação Excel com pré-visualização e reversão | existe | `import/engine/` |
| 3.7 | Desistência, suspensão, reingresso, conclusão | parcial | `student_status_history` vive; **`student_status_events` órfã** |

## Área 4 — Turmas, disciplinas e horários (6)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 4.1 | Turmas por escola/curso/classe/ano/turno | existe | `class_groups` |
| 4.2 | Docentes, disciplinas, cargas, substituições | parcial | `class_subjects` vive; **`teacher_subjects` órfã** |
| 4.3 | Prevenção de conflitos de horário | existe | corpo das `*_guarded` capturado em `1322b79` |
| 4.4 | Delegado, coordenador, capacidade | parcial | coordenador distinto do director de turma não localizado |
| 4.5 | Calendários, feriados, eventos | parcial | **sem tabela de feriados** |
| 4.6 | Mapas de turma, presenças, comunicação | existe | `siga_attendance_*` |

## Área 5 — Gestão académica e pedagógica (8)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 5.1 | Avaliações, pesos e fórmulas por nível | **esquema só** | as 8 colunas de `assessment_rule_sets` não são lidas por ninguém |
| 5.2 | Validação 0–20, arredondamentos | existe | zod no servidor; arredondamento unificado em `3a4a557` |
| 5.3 | Permissões de lançamento e alteração | existe | políticas estritas + triggers de âmbito; buraco fechado em `e1ee7be` |
| 5.4 | Médias, aproveitamento, reprovação | existe | corrigida a contradição média/estado em `3a4a557` |
| 5.5 | Mini-pautas, trimestrais e finais | **esquema só** | `grade_sheets`, `grade_sheet_rows`, `report_cards` **órfãs**; 4 RPCs com 0 chamadas |
| 5.6 | Presenças, faltas, assiduidade e conduta | parcial | presenças sim; **conduta ausente** |
| 5.7 | Encerramento, bloqueio, reabertura auditada | parcial | interruptor por escola em JSON; **sem razão de reabertura** |
| 5.8 | Histórico imutável ou versionado | **ausente** | sem trigger, sem versionamento; escrita fechada em `e1ee7be` |

## Área 6 — Gestão financeira (8)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 6.1 | Propinas, emolumentos, descontos, bolsas, multas | parcial | multas implementadas em `68ed653`; **descontos e bolsas fixos a 0** |
| 6.2 | Contratos, facturas, referências, planos | existe | numeração unificada em `next_document_number_service` |
| 6.3 | Pagamentos parciais, integrais, em atraso | existe | `register_payment` com `FOR UPDATE` |
| 6.4 | Integração com prestadores e webhooks | existe | Multicaixa, Unitel, PayFlow; chaves falham fechado |
| 6.5 | Idempotência e prevenção de duplicados | existe | `external_id` + índice único, aplicado e provado |
| 6.6 | Reconciliação | parcial | eventos registados; **sem rotina de confronto** |
| 6.7 | Anulação, estorno, reembolso com rasto | existe | `reverse_receipt` ligada em `ee9227f`; PayFlow corrigido em `cdd75a7` |
| 6.8 | Fecho de caixa e segregação de funções | **ausente** | `grep` por fecho de caixa: zero; mesmos papéis recebem e estornam |

## Área 7 — Documentos e relatórios (6)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 7.1 | Certificados, declarações, boletins, recibos | parcial | imprime-se; **nada fica registado** |
| 7.2 | Modelos por instituição e tipo | parcial | **dois modelos**: `document_templates` (com versão) e JSON em `school_settings` — usa-se o segundo |
| 7.3 | Numeração, autenticação, assinaturas, verificação | **esquema só** | `issued_documents` e `document_signatures` **órfãs**; RLS exemplar e sem uso |
| 7.4 | Exportação PDF e Excel | existe | com uma perda de acentuação já identificada |
| 7.5 | Permissões de emissão, download, revogação | **esquema só** | `revoke_school_document` com 0 chamadas |
| 7.6 | Relatórios com filtros e totais reconciliados | parcial | totais internamente coerentes; sem reconciliação externa |

## Área 8 — Portais e comunicação (6)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 8.1 | Portais por perfil | parcial | quatro portais para os seis perfis listados |
| 8.2 | Menus e notificações conforme permissões | parcial | menus por papel sim; **as notificações não chegam a ser mostradas** — ver abaixo |
| 8.3 | E-mails transaccionais e identidade institucional | existe | `fetchSchoolBranding` nos três fluxos |
| 8.4 | SMS/WhatsApp/push só quando integrados | existe | os quatro adaptadores falham fechado; canal SMS corrigido em `3e30c19` |
| 8.5 | Fila, reenvio, erros, duplicações, preferências | parcial | completo no OTP; **inexistente fora dele** |
| 8.6 | Avisos de faltas, notas, propinas, calendário | **esquema só** | ver abaixo |

**Correcção ao relatório da área 8.** Escrevi que um encarregado "só fica a saber se entrar
no portal e olhar". É pior: **a tabela `notifications` tem 16 linhas em produção e não é
lida por nada.** Verificado à mão — as únicas ocorrências de `notifications` em `src/` são
um comentário sobre Firebase e uma variável de estado `notificationsOpen`; o painel do sino
(`AppShell.tsx:487`) mostra `useSchoolAlerts()`, que lê `students`, e mensagens directas por
ler. Os cinco gatilhos que escrevem avisos — factura emitida, documento emitido, pedido de
documento, assinatura pendente, pauta — alimentam uma tabela invisível. Nem in-app chegam.

## Área 9 — Módulos complementares (6)

| # | Verificação | Veredicto | Evidência |
|---|---|---|---|
| 9.1 | Biblioteca, empréstimos, devoluções, multas | **ausente** | "biblioteca" no código = biblioteca de ficheiros |
| 9.2 | Capelania e modo adventista | **ausente** | zero ficheiros |
| 9.3 | Visitas pastorais, igrejas, estatísticas | **ausente** | zero ficheiros |
| 9.4 | Vídeo-aulas e recursos por disciplina | parcial | Zoom real; sem acervo |
| 9.5 | Cartões e biometria | parcial | cartões sim, fechados em `3c27139`; **biometria ausente** |
| 9.6 | Calendário, extracurriculares, plano | parcial | **extracurriculares ausentes**; plano só verificado na UI |

## Áreas 10 a 12 — por auditar

Base de dados e integridade (7), qualidade técnica e desempenho (7), design e experiência
(8). **Não avaliadas.** O inventário acima toca-lhes de lado — as 20 tabelas órfãs e as 7
sem leitor são matéria da área 10 — mas isso não substitui a auditoria.

---

## O que isto soma

Das **60** verificações das áreas 1 a 9 (7+6+7+6+8+8+6+6+6):

| Veredicto | Nº |
|---|---:|
| existe | 26 |
| parcial | 24 |
| **esquema só** | **5** |
| **ausente** | **5** |

*(Contagem tirada do próprio documento, não estimada — as colunas acima somam 60.)*

**As 5 "esquema só" são a conclusão principal deste documento.** São, uma a uma:

| # | O que está feito na base e não é usado |
|---|---|
| 5.1 | as 8 colunas de regra de `assessment_rule_sets` |
| 5.5 | `grade_sheets`, `grade_sheet_rows`, `report_cards` e 4 RPCs de ciclo de vida |
| 7.3 | `issued_documents`, `document_signatures`, `validate_issued_document` |
| 7.5 | `revoke_school_document` e as permissões documentais |
| 8.6 | os 5 gatilhos de aviso, que escrevem numa tabela que ninguém lê |

Não são funcionalidades por fazer — são funcionalidades **feitas e não ligadas**. Em todas,
alguém desenhou a base, escreveu as funções e pôs as políticas certas; foi a aplicação que
passou ao lado. É o trabalho mais barato de recuperar de toda a auditoria, porque a parte
difícil já está feita.

**As 5 ausentes dividem-se em duas naturezas, e não devem ser tratadas juntas.** O histórico
imutável (5.8) e o fecho de caixa com segregação de funções (6.8) são lacunas *dentro* de
módulos que existem e funcionam — são trabalho, e cabem na cadência normal. A biblioteca com
empréstimos (9.1), a capelania (9.2) e as visitas pastorais (9.3) são *módulos inteiros* que
não existem: são projectos, e não pertencem à mesma lista.

## A recomendação

**Separar a lista de verificação em duas, antes de voltar a usá-la para decidir produção.**

Uma verificação que nunca teve código não falha, não aparece nos testes e não aparece nos
erros — só aparece quando alguém a procura. Enquanto as três da área 9 estiverem na mesma
lista que "idempotência de pagamentos", a lista não distingue *o que está mal* de *o que
não existe*, e uma aprovação de produção que a use está a medir a coisa errada.

Em concreto:

1. **Tirar da lista de produção** as 3 ausentes que são módulos por construir (9.1, 9.2, 9.3), ou
   assumi-las como fora de âmbito da primeira entrega. São decisão do dono, não achado
   técnico.
2. **Ligar as 5 "esquema só"**, por ordem de risco: os avisos e a emissão de documentos
   primeiro, porque são os que a escola entrega a terceiros.
3. **Correr `npm run siga:inventario` depois de cada migração**, junto com
   `siga:db-snapshot`. É o que impede que a lista das órfãs volte a crescer sem ninguém dar
   por isso — que foi exactamente como se chegou aqui.
