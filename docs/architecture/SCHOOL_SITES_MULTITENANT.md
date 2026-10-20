# SIGA Plus — Websites Institucionais Multi-tenant (v1)

**Estado:** arquitectura e implementação incremental em branch. **Produção:** não aplicar alterações de DNS ou dados enquanto os testes e os critérios de activação não passarem.  
**Data:** 2026-10-20. **Responsáveis:** equipa SIGA, Cloudflare e agentes de código.

## 1. Visão e objectivo

Cada escola SIGA pode gerir uma presença institucional pública e um portal autenticado usando o **mesmo** tenant, as mesmas permissões e o mesmo banco PostgreSQL. O site apresenta somente informação explicitamente publicada. O portal continua a operar alunos, professores, documentos, finanças, matrículas e comunicações privadas.

**Separação obrigatória:**
- **WEB** (`painel/web`) vende o serviço SIGA; não é o CMS de cada escola.
- **ADMIN** (`painel/admin`) gere tenants, billing, DNS e provisionamento global.
- **SIGA** (raiz) alberga o portal escolar e as configurações do site autorizadas ao administrador da escola.
- **PAYFLOW** cobra; **DOC** documenta.
- **Website escolar**: conteúdo público do tenant, sem auth ou acesso a linhas privadas.
- `painel/escolas`: website independente ISPAB e laboratório de componentes; **não é um template universal já ligado à BD**.

Contratos canónicos: `AGENTS.md`, `docs/agents/ARCHITECTURE_HARMONIZATION.md`, `docs/agents/DATABASE_RULES.md`, `docs/domains/OVERVIEW.md` e `docs/architecture/SCHOOL_WEBSITE_API.md`.

## 2. Auditoria observada (leitura de produção, 2026-10-20)

| Objecto | Registos | Nota |
| --- | ---: | --- |
| `schools` | 48 | 47 active, 1 archived |
| `tenants` | 48 | 4 active, 43 archived, 1 provisioning_failed |
| `tenant_domains` | 47 | 47 active no campo BD; **não demonstra DNS/TLS operacional** |
| `school_branding` | 0 | Configuração adicional opcional |
| `tenant_provisioning` | 0 | Sem prova de provisionamento completo |
| `schools` sem `tenant_id` | 0 | Associação existe |
| `schools` cujo tenant não tem domain | 1 | Exige reconciliação controlada |

Estes números devem ser recalculados antes do rollout. **Não reactivar tenants arquivados nem povoar branding em massa.**

## 3. Endereços e migração sem regressões

**Primeira entrega (compatível):**
- `https://<slug>.portal-siga.com/site` → website público **somente depois da publicação**.
- `https://<slug>.portal-siga.com/` → portal SIGA **inalterado**.
- `/configuracoes/site` → gestão autenticada do website pelo Administrador da escola.
- `/api/public/school-site` → documento público da escola correspondente ao hostname, sem aceitar `school_id` do browser.

**Próxima entrega, condicionada a rollout canário e migração de links:** `/` pode tornar-se o website público e `/portal` a entrada autenticada, **apenas depois** de uma camada de compatibilidade, callbacks OAuth/MFA, bookmarks, SW/PWA, rotas e paths exclusivos para tenants terem sido auditados.

Domínios próprios são opcionais; seguir `tenant_domains` e `domain-verify.ts`. O wildcard Cloudflare permite multi-tenant sem um deployment por escola. Uma linha `status=active` não prova HTTP/TLS.

## 4. Modelo de dados v1 (sem nova tabela; migração RLS necessária)

Reutilizar `school_settings` com **um novo domínio** `school_website`: várias versões append-only por escola+domínio, `value jsonb` e `version` com UNIQUE `(school_id, domain, version)`. A versão mais recente é sempre a de maior número; uma publicação cria um novo registo, nunca UPDATE das versões anteriores. As escritas utilizam `context.supabase` e a RLS existente (`settings_insert_authorized`, AAL2 e permissão). **Não converter as tabelas `web_blog_posts` e `web_faqs` globais em CMS de escola.**

Estrutura JSON controlada por schema Zod:
- `schemaVersion: 1`
- `draft`: `title`, `tagline`, `about`, `heroImageUrl` opcional, `primaryColor` validada, `showContact`
- `published`: snapshot explícito ou null
- `publishedAt`: timestamp ou null

**Privacidade obrigatória:** como a política SELECT anterior de `school_settings` permite leitura a todos os membros (inclusive alunos e encarregados), a migração `20261020213000_school_website_draft_read_guard.sql` cria uma política SELECT **RESTRICTIVE** que exige `private.has_permission(school_id, 'schools.settings.create')` somente para o domínio `school_website`. Os outros domínios não mudam. **Aplicar a migração revista primeiro em staging, depois em produção com autorização e antes de disponibilizar `/configuracoes/site`.** Não remover o controlo existente de membro nem modificar tabelas existentes.

**Bloqueio de activação:** `SCHOOL_SITES_ENABLED` é uma variável exclusiva do servidor, desligada por omissão; o editor e a API pública falham fechado até que a migração RLS tenha sido aplicada/verificada e a flag seja ligada no Worker. **Nunca publicar automaticamente o rascunho novo.** O backend calcula o conteúdo inicial a partir do nome da escola sem gravar: abre o editor com a versão default; salvar grava apenas o próprio domínio da escola. A versão publicada é um snapshot independente do rascunho.

O modelo v1 é uma página institucional editável e com contacto; **não** constitui ainda um CMS multi-página, biblioteca avançada, editor de blocos ou motor de templates 3×. Só expandir quando contratos, migrações e RLS estiverem preparados.

## 5. Isolamento e autoridade

- Resolução da escola pública: hostname canónico recebido pela aplicação → `tenant_domains` com estado válido → tenant → escola vinculada; usar somente colunas publicáveis.
- Não confiar em `school_id`, `tenant_id`, `slug` ou `Origin` fornecidos pelo browser para autorizar escrita.
- Escrita: `requireSupabaseAuth` + `requireSgaWriterForWrite("gestao", ... , ["Administrador"])` + verificação de AAL2 e estado do tenant.
- Leitura privada: administrador escolar da **escola da sessão**.
- Leitura pública: apenas snapshot `published`; se indisponível, suspenso, archived ou não publicado, responder 404/503, sem fallback para dados de demo.
- Conteúdo público = strings renderizadas como texto (sem HTML arbitrário); links internos estáticos.
- Imagens externas só HTTPS e origens confiáveis/validadas; segurança do `siga_files` respeitada. Não expor storage privado.
- Nunca expor API keys / service_role no cliente. No Cloudflare, `CLOUDFLARE_API_TOKEN` é server-only.
- RLS e ACL mantêm-se; a API pública é a **única** fronteira para os snapshots publicados. Cache pública diferenciada por hostname; não servir dados privados.

## 6. Publicação e concorrência

O editor grava rascunho explicitamente, inserindo uma nova versão a partir da versão esperada. A UNIQUE do banco impede que duas sessões publiquem o mesmo número de versão. A acção Publicar copia o draft validado para published (snapshot). Uma edição posterior não altera a versão publicada até nova publicação. Se a versão mudou, 409/conflito e solicitar recarregar. Não repetir silenciosamente writes.

Esta v1 preserva as versões anteriores em `school_settings`, mas ainda não oferece um painel de histórico, reversão pública ou fluxo de aprovação editorial. Para o CMS multi-página futuro, criar tabelas dedicadas `school_site_pages`, `school_site_page_versions` e `school_site_publications`, **apenas após** a revisão do schema de produção e migração idempotente.

## 7. Provisionamento

`provisionTenantCore()` já cria tenant, domínio, escola, Auth, membership, roles e defaults. Na v1, não acrescentar escrituras de domínio website dentro da saga: todo tenant obtém template inicial determinístico quando o seu administrador abre o editor. Isto elimina orphan records e não afecta rollback já existente. Publicação explícita activa o website no path `/site`.

A estratégia de site na raiz e provisionamento persistente é etapa separada: implementar fila/retry auditável `tenant_provisioning` só depois de validar o fluxo com dados reais, idempotência, DNS e login.

## 8. Aceitação e rollout

### CI e testes
- Schema rejeita HTML/scripts, `javascript:`, cores inválidas, strings excessivas, imagens não HTTPS.
- Editor só Administrador+AAL2 grava ou publica.
- Sem publicação retorna indisponível, sem revelar rascunho.
- Tenant arquivado/suspenso não serve website.
- Outro hostname/tenant não vê dados nem altera o site.
- Editar não publica; publicar usa snapshot; conflitos não sobrescrevem.
- Build/typecheck, Vitest, testes de auth, Playwright mobile/desktop e Lighthouse.
- Verificar rotas canónicas, PWA, domínio próprio, TLS e rollback.

### Activação
1. Verificar `supabase/PRODUCTION_SNAPSHOT.json` e DB real, sem modificar produção.
2. Fazer branch, PR e validar CI.
3. Ensaiar em staging **sem** dados de menores nem cobrança real.
4. Validar um tenant canário activo, site `/site`, acesso portal `/`, OAuth e MFA.
5. Só então activar por escola; manter switch de desactivação na camada de publicação.
6. Não alterar `main`, DNS ou base de produção se houver testes por correr ou configuração incerta.

## 9. Roadmap avançado pós-v1

- Editor por blocos/drag & drop e temas versionados aprovados.
- Páginas, menus, blog, eventos, calendário, admissões e cursos públicos mediante opt-in.
- Upload/PickFileButton, thumbs públicas derivadas de ficheiros autorizados.
- SEO/sitemap/robots, locale pt-AO e acessibilidade WCAG.
- Histórico/rollback de publicação, auditoria em `saas_audit_logs` e `audit_logs`.
- Custom hostnames/Cloudflare for SaaS com DNS-01 e validação do proprietário.
- Site na raiz da escola e portal em `/portal`, com compatibilidade legada.
- Verificação do custo e das quotas Cloudflare.

**Não apresentar os itens deste roadmap como implementados.**
