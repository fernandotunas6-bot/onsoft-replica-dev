# Auditoria SIGA Plus — 7. Documentos e relatórios

**Data:** 2026-09-24 · **Âmbito:** apenas a área 7 · **Código não alterado.**

Evidência: `supabase/PRODUCTION_SNAPSHOT.json` recapturado hoje, consultas em
leitura à produção ligada, e um teste executado para a codificação dos PDF.

---

## O padrão que a área 5 já tinha mostrado, agora confirmado

A área 5 concluiu que o ciclo de vida oficial da pauta (`build_grade_sheet`,
`transition_grade_sheet`, `issue_report_cards`, `reopen_gradebook`) nunca é
chamado pela aplicação. **O mesmo se passa, por inteiro, com os documentos.**

A base tem um modelo documental completo e bem construído:

| Tabela | O que resolve |
|---|---|
| `document_templates` | modelo por escola e tipo, com `version`, `status`, `allowed_fields` |
| `issued_documents` | `document_number`, `validation_code`, `body_snapshot`, `template_version` |
| `document_signatures` | `signer_role`, `requested_by`, `acted_by`, `acted_at` |
| `document_sequences` | numeração por escola e tipo, semeada para **90 escolas** |

`issued_documents` guarda o corpo do documento no momento da emissão
(`body_snapshot`) e a versão do modelo usado — logo, alterar o modelo depois não
reescreve o que foi entregue. Tem `validation_code` para verificação documental e
`revoked_at`/`revoked_by`/`revocation_reason` para revogação.

**Achado (P1): a aplicação nunca lhe toca.** `issued_documents` tem **zero**
ocorrências em `src/`. `validation_code` idem. Nenhum certificado, declaração ou
boletim emitido pelo SIGA fica registado, numerado ou verificável.

O que a aplicação faz (`src/features/documents/server.ts`, 501 linhas) é:
`document_requests` (criar e mudar estado) e modelos de impressão guardados em
`school_settings`. `updateDocumentRequestStatus` aprova o pedido — muda `status`
e `reviewed_by` — e **acaba aí**. Não emite nada.

São, portanto, dois sistemas de modelos em paralelo: `document_templates`, com
versão e campos permitidos, e um saco JSON em `school_settings` no domínio
`print_templates`. Usa-se o segundo.

## 7.3 Numeração, autenticação, assinaturas e verificação — a RLS mais limpa do sistema

Vale registar pelo contraste com as áreas 5 e 6. Cada tabela documental tem
exactamente três políticas, e todas seguem a mesma forma:

```
SELECT  → has_permission(school, 'documents.issued.read')
INSERT  → is_aal2() AND has_permission(school,'documents.issued.issue')
          AND issued_by = auth.uid()
UPDATE  → is_aal2() AND has_permission(school,'documents.issued.revoke')
```

MFA, permissão granular distinta para emitir e para revogar, e o autor amarrado
ao utilizador real. **Nenhuma política DELETE em nenhuma delas** — um documento
não se apaga, revoga-se. E, ao contrário de todas as outras áreas, **nenhuma
política antiga sobreposta**. As 14 permissões `documents.*` estão semeadas em
produção (267 a 534 concessões de papel cada).

Isto mostra que o endurecimento foi feito bem algures. O que falha nas outras
áreas é higiene de migração, não desenho.

**Achado (P2): a verificação documental não teria como funcionar.** Mesmo que a
emissão passasse a escrever em `issued_documents`, um `validation_code` só serve
se alguém de fora o puder confirmar. `issued_documents` não tem concessão a
`anon` nem política que o abranja, e não existe rota pública de verificação. Como
está, o código de validação seria um número que ninguém consegue validar.

## 7.1 e 7.2 Documentos e modelos por instituição

**Parcialmente implementado.** As tabelas cobrem certificados, declarações,
boletins (`report_cards`), recibos (`finance_receipts`), contratos
(`finance_contracts`) e cartões (`siga_access_cards`). `report_cards` tem RLS
correcta — emissão exige `assessment.grades.homologate`, o que liga o boletim à
homologação da pauta. Mas `report_cards` é escrito por `issue_report_cards`, que
a área 5 confirmou nunca ser chamado.

Pautas e boletins **são** produzidos — em `pautas/`, por impressão directa, com o
trabalho de hoje a separar a projecção oficial da grelha viva. O que não existe é
o registo do que foi emitido.

## 7.4 Exportação PDF e Excel, acentuação e impressão

**Implementado.** `jspdf` 4.2.1 + `jspdf-autotable` para PDF, `exceljs` 4.4 para
Excel, `src/lib/export-pdf.ts` com cabeçalho institucional e tabelas paginadas.

**Acentuação: verificada, e está correcta.** Em vez de a assumir, gerei um PDF e
inspeccionei o fluxo de conteúdo. Todos os caracteres que o sistema usa são
codificados correctamente pelas fontes padrão (WinAnsi):

```
OK  ç (0xE7)   ã (0xE3)   é (0xE9)   — travessão (0x97)
OK  · (0xB7)   ª (0xAA)   ½ (0xBD)   © (0xA9)
```

O travessão longo, que `formatScore` devolve para notas em falta, sai bem.

**Achado (P3): fora de CP1252 perde-se.** No mesmo teste, `€` é descartado, e
`ŋ`, `ɛ`, `ɔ`, `ā` passam a uma codificação de dois bytes para a qual as fontes
padrão não têm glifo — saem em branco. Não há fonte incorporada (`addFont` não
aparece no código). Um nome numa ortografia bantu imprime com lacunas. É estreito,
mas é um documento oficial com o nome de uma pessoa.

## 7.5 Permissões para emissão, download, partilha e revogação

**Achado (P0): a biblioteca de ficheiros ignora a própria coluna de
visibilidade.** `siga_files` guarda os documentos da escola — e é onde a área 6
mostrou que os recibos são arquivados (`archiveFinanceQuietly`). As suas políticas
são duas, e sem qualquer verificação de papel ou permissão:

```
SELECT → is_school_member(school_id)
ALL    → is_school_member(school_id)
```

A tabela tem colunas `visibility`, `area` e `owner_user_id`, e **nenhuma delas
entra na RLS**. Toda a privacidade é imposta em código de aplicação, num único
sítio (`src/features/arquivos/server.ts:136-140`), e são três regras distintas:

```ts
if (!canReadFileArea(role, row.area)) return false;
if (row.area === "pessoal" && row.ownerUserId !== userId) return false;
if (row.visibility === "private" && row.ownerUserId !== userId) {
  return role === "Administrador" || (row.area === "secretaria" && role === "Secretaria");
}
```

Quem consultar `siga_files` directamente pelo PostgREST com o seu próprio token —
que está no browser — lê **todos** os ficheiros da escola, incluindo os marcados
`private` e os de outros utilizadores, e pode alterá-los ou apagá-los (`ALL`). O
`visibility` é uma convenção da interface, não um limite.

**Achado (P1): `person_documents` tem a mesma sobreposição das áreas 5 e 6, sobre
documentos de identidade.** As políticas cuidadas existem — SELECT exige
`can_read_students()`, UPDATE e INSERT exigem `can_manage_students()` e amarram
`created_by`. Ao lado delas ficaram duas antigas: `ALL` e `SELECT`, ambas só com
`is_school_member`. Sendo permissivas, combinam-se com OR: qualquer membro activo
lê, altera e apaga o número de BI ou passaporte de qualquer pessoa da escola.

**Correcção à área 5:** a contagem que dei ali (9 tabelas com escrita permissiva
sobreposta) estava subestimada. A consulta agrupava por `(tabela, comando)` e não
via que uma política `ALL` se sobrepõe a **todas** as outras da tabela. Corrigida,
são **10**: `class_groups`, `enrollments`, `grade_items`, `grade_scores`,
`gradebooks`, `people`, `person_documents`, `siga_assessment_items`,
`siga_assessment_scores`, `students`.

## O que substitui a RLS quando a aplicação a contorna

`updateDocumentRequestStatus` não escreve com a sessão do utilizador: chama
`loadSgaAdminClient()` — `service_role`, que ignora RLS — e substitui a
verificação por `requireSgaWriter(context.supabase, userId, ["Administrador",
"Secretaria"])`.

`requireSgaWriter` (`sga-admin.ts:54-85`) confirma que há membership activa e que
`membership.appRole` está na lista. **Não verifica MFA, não verifica permissão
granular, não amarra o autor.** É um teste ao nome do papel. Quando a lista não é
passada, a omissão é `["Administrador","Secretaria","Tesouraria"]`.

O padrão é largo: **341** chamadas a `loadSgaAdminClient()` em 81 ficheiros, com
**177** guardas `requireSgaWriter`. Não são comparáveis um a um — uma guarda cobre
várias chamadas no mesmo handler — mas a direcção é clara: onde o cliente de
serviço entra, a RLS sai, e o que fica é mais fraco do que aquilo que substituiu.
No caso dos documentos, o que é contornado é precisamente a melhor RLS do sistema.

**O que verifiquei e está bem:** procurei endpoints expostos (`createServerFn`)
que usem o cliente de serviço sem guarda nenhuma. São três —
`dev-bypass.server.ts`, `reset-password-otp-server.ts` e `otp/server.ts` — e os
três são, por desenho, anteriores à sessão. **Não há endpoint exposto sem
guarda.** O problema é a força da guarda, não a sua ausência.

## 7.6 Relatórios com filtros e totais reconciliados

**Parcialmente implementado.** Existem `getFinanceReporting`, relatórios
académicos (`RelatoriosAcademicosCharts`), estatísticas no painel e exportação
SAF-T AO. Filtros e totais existem por relatório.

**Reconciliados, não.** A área 6 estabeleceu que não existe reconciliação
financeira: nada compara os eventos do gateway com os recibos emitidos. Um
relatório pode apresentar um total correcto face à sua própria tabela e continuar
a divergir da realidade do gateway, sem que nada o assinale.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P0** | `siga_files`: `visibility`, `area` e `owner_user_id` não entram na RLS; qualquer membro lê, altera e apaga todos os ficheiros da escola pelo PostgREST | 2 políticas `is_school_member`; `arquivos/server.ts:136-140` |
| **P1** | `person_documents`: política `ALL` antiga anula as estritas, sobre documentos de identidade | `pg_policies` |
| **P1** | `issued_documents`, `validation_code` e `document_signatures` com zero uso na aplicação: nada emitido fica registado, numerado ou revogável | `grep` em `src/` |
| **P1** | `requireSgaWriter` substitui a RLS por um teste ao nome do papel — sem MFA, sem permissão granular, sem autor | `sga-admin.ts:54-85`; 341 usos do cliente de serviço |
| **P2** | Sem rota pública de verificação, e `issued_documents` sem acesso a `anon`: o código de validação não seria validável | retrato + ausência de rota |
| **P2** | Dois sistemas de modelos; usa-se o que não tem versão nem campos permitidos | `document_templates` vs `school_settings:print_templates` |
| **P2** | Relatórios com totais internamente coerentes e sem reconciliação externa | área 6 |
| **P3** | PDF perde caracteres fora de CP1252; sem fonte incorporada | teste executado |

**Não é um achado, é o contrário:** a RLS documental é a melhor do sistema — três
políticas por tabela, MFA, permissão granular separada para emitir e revogar,
autor amarrado, nenhuma política DELETE e nenhuma sobreposição. O trabalho está
feito. Falta ligá-lo: a aplicação passa ao lado, com o cliente de serviço.

**A ordem que proponho:** o P0 de `siga_files` primeiro — é o único desta área que
expõe dados hoje, e resolve-se levando as três condições de `server.ts:136-140`
para dentro da política, onde já estão escritas. Depois
`person_documents`, no mesmo trabalho das outras 9 tabelas com sobreposição.
Ligar a emissão a `issued_documents` é maior e não urge — mas enquanto não for
feito, nenhum documento que a escola entrega existe no sistema.
