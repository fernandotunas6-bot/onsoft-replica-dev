# Runbook — SIGA School Sites (leitura, validação e rollback)

**Criado:** 2026-10-20. **Ambiente:** produção SGA é dado real — nenhuma migração ou alteração DNS durante a implementação em branch.

## 1. Pré-requisitos e responsabilidades

- Código no branch PR #200 validado pelo CI (typecheck, lint, testes, build).
- Sessão real de administrador escolar com MFA AAL2, perfil válido e school membership activa.
- Pelo menos um tenant de teste **activo** e autorizado; não reactivar uma instituição arquivada.
- Estado do tenant, schema `school_settings`, hostname TLS e rotas Cloudflare revistos.
- Aprovação de janela canário e responsável de rollback.

## 2. Evidências do estado inicial (20-10-2026)

Leitura de `public.schools`, `public.tenants`, `public.tenant_domains`:
- 48 escolas e 48 tenants: 4 tenants active, 43 archived, 1 provisioning_failed;
- 47 domínios active **no banco**;
- a escola sem domínio está `archived` e tem tenant `provisioning_failed`;
- 0 linhas em `school_branding` e `tenant_provisioning`.

Cloudflare API, zona `portal-siga.com`, retornou:
- zone `active`;
- DNS AAAA proxy `*.portal-siga.com` e `app.portal-siga.com`;
- Workers Route `*.portal-siga.com/*` → `fernandotunas6-bot-onsoft-replica-dev`;
- `payflow.portal-siga.com/*` → `siga-plus-payflow`;
- `www`, `admin`, `docs` têm bypass Workers (`script:null`).

**Importante:** estes estados não comprovam que todo hostname escolar tenha certificado válido, que os dados estejam correctos ou que o novo site já esteja publicado.

## 3. Pré-flight leitura (não executa mutações)

```sql
SELECT t.status AS tenant_status, s.status AS school_status, COUNT(*) AS escolas
FROM public.schools s
JOIN public.tenants t ON t.id = s.tenant_id
GROUP BY t.status, s.status
ORDER BY t.status, s.status;

SELECT s.status AS school_status, t.status AS tenant_status, COUNT(*) AS sem_dominio
FROM public.schools s
JOIN public.tenants t ON t.id = s.tenant_id
WHERE NOT EXISTS (SELECT 1 FROM public.tenant_domains d WHERE d.tenant_id = t.id)
GROUP BY s.status, t.status;

SELECT domain, COUNT(*) AS configuracoes FROM public.school_settings
GROUP BY domain ORDER BY domain;
```

Exigir revisão manual de `tenant_domains` e do certificado HTTPS do canário antes do deploy.

## 4. Bloqueio RLS e ordem de activação

**Migração obrigatória ainda não aplicada em produção:** `supabase/migrations/20261020213000_school_website_draft_read_guard.sql`. A política actual de SELECT em `school_settings` é apenas `settings_select_member`: isso inclui alunos e encarregados, pelo que gravar dados editoriais antes da migração exporia rascunhos pela API direct Supabase, apesar do site público esconder esses dados.

1. Rever migração com o snapshot e o DB real, testar duas vezes a idempotência em **staging** com contas de Administrador, Secretaria, Professor, Aluno e Encarregado.
2. Verificar que o administrador da escola ainda lê e grava o domínio `school_website`, e alunos/encarregados **não** conseguem ler nenhuma versão dele.
3. Verificar que todos os utilizadores continuam a ler os outros domínios que lhes eram acessíveis antes, sem regressões.
4. Aplicar à produção **apenas com autorização específica e backup**, antes de activar as novas rotas. Não aplicar automaticamente a partir desta PR.
5. O módulo é **fail-closed**: no Worker, `SCHOOL_SITES_ENABLED` está ausente ou diferente de `true` por omissão. Só configurar `SCHOOL_SITES_ENABLED=true` **depois** de confirmar a migração RLS, as permissões e o canário. Na ausência da flag, o editor recusa leituras/gravações e a API pública responde como indisponível. Não usar `VITE_` (não expor como flag de cliente).
6. Depois executar ensaio do website e validar TLS/hostnames; se falhar, não activar a publicação.

### Ensaio de comportamento RLS sem dados reais (21-10-2026)

O workflow `.github/workflows/school-sites-rls.yml` executou com sucesso
`tests/sql/school-website-draft-read-guard.mjs` usando PostgreSQL/PGlite
isolado, na execução GitHub Actions `39546047292`.

- Aplicou a migração verdadeira **duas vezes**, sem duplicar políticas.
- Comprovou que membros comuns da escola A não lêem rascunhos
  `school_website`, mas mantêm leitura de outros domínios permitidos.
- Comprovou que o administrador da escola A lê as versões de A, mas não B,
  e vice-versa, e que nenhuma versão fica legível para `anon`.
- Simulou a função `private.has_permission` com autorização isolada de teste:
  **não equivale** a testar a função e os JWT/MFA reais do SGA.

Entre os projectos Supabase ligados só está activo `Sga` (produção);
outro projecto encontra-se inactivo e não foi identificado como staging.
Por isso, **não aplicar a migração a produção nem activar
`SCHOOL_SITES_ENABLED`** antes de validar num staging independente e
autorizado, com sessões reais de todos os perfis e cópia controlada do esquema,
sem dados pessoais de alunos.

## 5. Ensaio v1

1. Admin MFA entra em `/configuracoes/boas-vindas` e segue **Configurar website**.
2. O editor abre com default mas a API pública `/api/public/school-site` devolve 404.
3. Guardar rascunho → continua 404 para visitante.
4. Publicar → API devolve apenas `published`, sem o draft, IDs, dados pessoais ou privilégios.
5. Abrir `/site` e testar link `Entrar no Portal` (`/`).
6. Alterar rascunho → público mantém snapshot publicado.
7. Segunda sessão com versão antiga → erro de concorrência, sem overwrite (UNIQUE school_id/domain/version). As versões anteriores permanecem preservadas.
8. Aluno, professor e administrador de outra escola → não conseguem guardar nem publicar.
9. Suspender tenant em ambiente de ensaio → site não é servido.
10. Playwright viewport mobile/tablet/desktop, navegação por teclado, leitura de ecrã e Lighthouse.

### Ensaio visual sem produção (executado em 20-10-2026)

A matriz `tests/e2e/school-site-visual.spec.ts` foi executada no Chrome (GitHub Actions), com **8/8 testes aprovados** e um servidor HTTP localhost. A API pública foi interceptada com dados fictícios; as variáveis Supabase apontavam para `127.0.0.1`, não para a base real.

Para repetir sem dados reais, use um servidor local SIGA com um endpoint Supabase de desenvolvimento e chave **fictícia de ensaio**; depois:

```sh
SIGA_SCHOOL_SITE_VISUAL_E2E=1 \
VITE_SIGA_URL=http://localhost:3006 \
bunx playwright test tests/e2e/school-site-visual.spec.ts
```

A suite valida seis larguras de ecrã (320, 390, 768, 1024, 1440, 1920), navegação para o Portal Escolar, estrutura institucional, scroll horizontal, ausência de rascunhos e movimento reduzido. **Não demonstra pixel-parity com ISPAB** nem substitui ensaios com DNS/TLS, sessão real do administrador ou sandbox de publicação.

### Comparação ISPAB × SIGA em Chrome (21-10-2026)

O workflow `.github/workflows/school-site-visual.yml` reconstruiu a
**referência original**, sem modificar os seus ficheiros, e executou
`tests/e2e/school-site-visual.spec.ts` com
`tests/e2e/school-site-reference-parity.spec.ts` numa aplicação local
com dados fictícios. **11/11 testes passaram** (GitHub Actions
`39546647842`): seis larguras para o SIGA, acessibilidade básica,
estado não publicado, movimento reduzido e dois ensaios lado a lado
a 390 e 1440 px. O workflow guarda quatro capturas no artefacto
`school-sites-ispab-comparacao-visual` durante sete dias.

Foram comparadas fontes DM Sans/Manrope, presença de cabeçalho e hero,
altura do cabeçalho em desktop, proporção da grelha e ausência de scroll
horizontal. **Isto não comprova identidade de píxeis** nem dispensa a
revisão humana do menu aberto, das 60 páginas ISPAB, do conteúdo
verdadeiro, da sessão autenticada e dos domínios públicos.

## 6. Rollout

- Nunca executar `supabase db push` ou migrações `drizzle/` na base SGA.
- PR submetida à revisão e CI completamente verde.
- Deploy apenas após aprovação explícita e validação de canário.
- Publicar primeiro apenas uma escola de teste: os restantes tenants não têm `published`.
- URLs `/` e callbacks auth existentes continuam intactos.
- Rever CSP, imagens remotas, privacidade dos contactos, analytics e SEO antes da disponibilização pública ampla.

## 7. Rollback

1. Suspender promoção do deployment.
2. Restaurar deployment anterior do Worker SIGA pelo processo CI existente.
3. **Não eliminar** `school_settings` nem `tenant_domains`; preservar rascunhos e snapshots. Manter a política SELECT restritiva mesmo que o website seja desactivado, para não expor rascunhos existentes.
4. Se a indisponibilidade for específica do website, entrar como Administrador com MFA em `/configuracoes/site`, escolher **Retirar website do ar** e confirmar. A operação cria uma nova versão `published: null`, mantém o rascunho e o histórico, e a API pública passa a responder indisponível. Não manipular directamente linhas SQL em produção sem revisão.
5. Revalidar portal `/`, auth MFA, arquivos, financeiro e rotas PayFlow.
6. Documentar ocorrência, escopo e escolas afectadas.

## 7. Pendências antes do "tudo completo"

Construção multi-página, SEO por tenant, página pública na raiz, portal em `/portal`, templates sectoriais, integração FilePicker, posts/eventos/cursos reais, domínios próprios, auditoria transaccional versionada e activação automática com 100% de validação.
