<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Keep the school database contract in `src/integrations/supabase/types.sga.ts`, refreshed by `siga:gen-types`; the exact TypeScript path and `.sga` module suffix resolve both aliased and relative type imports without changing generated Lovable clients or their connection settings.

# Continuação para agentes

**Ecossistema (ler ao abrir):** [docs/agents/ARCHITECTURE_HARMONIZATION.md](docs/agents/ARCHITECTURE_HARMONIZATION.md).

WEB vende (`painel/web`). ADMIN controla (`painel/admin`). SIGA trabalha (raiz). PAYFLOW cobra (`painel/payflow`). DOC explica (`painel/docs`). Skill: `siga-ecosystem`.

Handoff e estado dos ciclos: [docs/agents/CONTINUE.md](docs/agents/CONTINUE.md).

Skills: `.cursor/skills/siga/SKILL.md`, `siga-web`, `siga-admin`, `siga-docs`, `siga-saas`, `siga-identity`, e `.cursor/skills/siga-*/SKILL.md` por módulo escolar.

**Velocidade e refinamento:** `.cursor/skills/siga-performance/SKILL.md` — optimizar o
que existe, sem acrescentar/remover funcionalidades ou elementos, sem aumentar a
interface nem alterar a identidade. Medir antes/depois e preservar segurança e dados.

**Identidade Digital (domínios, e-mail, subdomínios):** skill `siga-identity` + docs em `docs/domains/`, `docs/email/`, `docs/cloudflare/`, `docs/multi-tenant/`, `docs/provisioning/`.

Auto-construção:

```sh
npm run siga:check
npm run siga:sql
npm run siga:scaffold -- <modulo> [--route=/caminho] [--with-page]
```

No SGA não aplicar migrações Lovable. SQL correcto: `npm run siga:sql`.

**Base de dados — ler antes de qualquer SQL:** [docs/agents/DATABASE_RULES.md](docs/agents/DATABASE_RULES.md).
O Lovable está ligado à base de **produção**: uma migração aprovada corre nas escolas reais.
Em resumo: confirmar colunas em `supabase/PRODUCTION_SNAPSHOT.json`; triggers com
`siga_touch_updated_at()`; SQL idempotente; `is_school_member` inclui alunos e encarregados,
por isso nunca serve para escrita nem para dados sensíveis; tabelas sensíveis só com o
servidor (`FORCE ROW LEVEL SECURITY` + `REVOKE ALL … FROM PUBLIC, anon, authenticated`).


## Padrão visual obrigatório — SIGA Plus 2026

Antes de qualquer alteração de UI, navegação ou performance, ler
[docs/design/VISUAL_MASTER_2026.md](docs/design/VISUAL_MASTER_2026.md) integralmente.
É o contrato visual aprovado pelo proprietário em 23/10/2026, incluindo os
aditamentos: menu compacto e conteúdo em página por omissão; modais pequenos
apenas quando necessários; preferência alternativa por escola. Este contrato
substitui orientações visuais antigas incompatíveis sobre modais grandes e
expansão automática. Preservar identidade, funcionalidades, RBAC/MFA/RLS e dados.
Actualizar [a matriz de execução](docs/design/VISUAL_MASTER_STATUS.md) com
evidência por fase e módulo; não omitir requisitos nem declarar validação sem teste.
