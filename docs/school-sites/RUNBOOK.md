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

## 4. Ensaio v1

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

## 5. Rollout

- Nunca executar `supabase db push` ou migrações `drizzle/` na base SGA.
- PR submetida à revisão e CI completamente verde.
- Deploy apenas após aprovação explícita e validação de canário.
- Publicar primeiro apenas uma escola de teste: os restantes tenants não têm `published`.
- URLs `/` e callbacks auth existentes continuam intactos.
- Rever CSP, imagens remotas, privacidade dos contactos, analytics e SEO antes da disponibilização pública ampla.

## 6. Rollback

1. Suspender promoção do deployment.
2. Restaurar deployment anterior do Worker SIGA pelo processo CI existente.
3. **Não eliminar** `school_settings` nem `tenant_domains`; preservar rascunhos publicados para migração.
4. Se a indisponibilidade for específica de um website, remover a publicação no serviço autorizado (operação de despublicação futura com auditoria); não manipular diretamente linhas SQL em produção sem revisão.
5. Revalidar portal `/`, auth MFA, arquivos, financeiro e rotas PayFlow.
6. Documentar ocorrência, escopo e escolas afectadas.

## 7. Pendências antes do "tudo completo"

Construção multi-página, SEO por tenant, página pública na raiz, portal em `/portal`, templates sectoriais, integração FilePicker, posts/eventos/cursos reais, domínios próprios, auditoria transaccional versionada e activação automática com 100% de validação.
