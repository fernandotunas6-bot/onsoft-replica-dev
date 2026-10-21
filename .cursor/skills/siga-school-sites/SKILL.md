---
name: siga-school-sites
description: Configurar e evoluir websites institucionais multi-tenant da escola SIGA, mantendo o portal existente, privacidade, publicações e Cloudflare.
---

# SIGA School Sites

**Antes de programar:** ler `AGENTS.md`, `docs/agents/DATABASE_RULES.md`, `docs/agents/ARCHITECTURE_HARMONIZATION.md`, `docs/architecture/SCHOOL_SITES_MULTITENANT.md` e `docs/school-sites/RUNBOOK.md`.

## Regra visual inviolável

Ler `docs/school-sites/VISUAL_CONTRACT.md`. Não alterar **nenhum** ficheiro em `painel/escolas/**`. Manter integralmente os componentes, CSS, fontes, composição, interacções e fotografias do website ISPAB. Qualquer adaptação multi-tenant é independente e testada lado a lado. Não alegar identidade pixel-perfect sem evidências.

## Contratos

1. `/site` é público, mas só mostra snapshot explicitamente publicado; `/` mantém o SIGA existente.
2. `/configuracoes/site` é do Administrador da própria escola; escrita exige sessão, papel, módulo, tenant activo e AAL2.
3. `/api/public/school-site` **não** aceita tenant/school ID: resolve apenas hostname exacto de `tenant_domains` e confirma tenant/escola.
4. Domínio `school_website` em `school_settings`: draft e published separados; contador `version` com CAS e erro de conflito.
5. Não repor conteúdo demo nem misturar `painel/web` (comercial) com site escolar.
6. `painel/escolas` é site ISPAB, não um CMS universal; reutilizar somente padrões que façam sentido.
7. Proteger scripts/HTML, media privada, CSP, PII, auth/MFA e isolamento multi-escola.
8. A migração RLS `20261020213000_school_website_draft_read_guard.sql` é obrigatória antes da activação: `settings_select_member` permite ler rascunhos aos alunos/encarregados. Não aplicar automaticamente, testar em staging e exigir autorização de produção. Sem `SCHOOL_SITES_ENABLED=true` exclusivamente no Worker, o módulo falha fechado. Nunca executar Lovable/Drizzle no SGA.
9. Cloudflare wildcard existente não significa publicação automática, certificados válidos ou permissões de custom domain.
10. Não transferir para `main` nem fazer deploy sem CI, canário e revisão.

## Testes obrigatórios

`tests/school-website/school-site-schema.test.ts` e testes cruzados de auth, tenant e dominio; CI, Playwright e E2E reais antes de produção.
