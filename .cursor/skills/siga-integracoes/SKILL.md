---
name: siga-integracoes
description: >-
  Extends SIGA catalog-ready integrations (Multicaixa Express, Unitel Money,
  Classroom, Moodle, WhatsApp Business). Use when editing integrations
  catalog, school_integrations, or Settings integrations panel.
---

# SIGA · Integrações

- Catálogo: `src/features/integrations/catalog.ts`
- Server: `src/features/integrations/server.ts`
- UI: `AcademicIntegrationsCatalog` em `settings-panels.tsx`
- Tabela: `school_integrations` (SQL premium)

## Regras

1. Catalog-ready: gravar merchant/callback/sandbox. Sem chamadas HTTP a terceiros.
2. Sem tabela: `listSchoolIntegrations` devolve o catálogo `disconnected`.
3. Pagamentos ligados a `siga-financeiro` (`createPaymentPlan`).
4. Instalar: `installSchoolIntegration` pede consentimento e grava `grantedCapabilities`. Pacotes em `install.ts`. Funções aparecem via `InstalledModuleTools`.
5. Rotas públicas não usam `listInstalledCapabilities`. `getPublicEnrollmentForm` devolve `installedProviders` + contactos filtrados (`publicSchoolPhone`, `publicSchoolEmail`). Helper: `publicInstalledProviderIds`.
6. Superfícies recentes: dashboard e Definições → Financeiro usam `InstalledModuleTools`; alunos têm botão SIGE no cabeçalho; comunicações copiam texto Resend ao publicar canal E-mail; calendário tem WhatsApp/E-mail por período; turma pré-visualiza link WhatsApp; matrícula pública usa `publicSchoolPhone` / `publicSchoolEmail`; campanha e folha de matrícula copiam convites Resend; `PrintTemplateStudio`, `GradePautaSheet`, `AssessmentCenter` e workspace do professor têm WhatsApp/E-mail quando instalados.
7. Testes: `tests/integrations/install.test.ts`, `launcher.test.ts`, `actions.test.ts`.
