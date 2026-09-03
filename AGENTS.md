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

# Continuação para agentes

**Ecossistema (ler ao abrir):** [docs/agents/ARCHITECTURE_HARMONIZATION.md](docs/agents/ARCHITECTURE_HARMONIZATION.md).

WEB vende (`painel/web`). ADMIN controla (`painel/admin`). SIGA trabalha (raiz). PAYFLOW cobra (`painel/payflow`). DOC explica (`painel/docs`). Skill: `siga-ecosystem`.

Handoff e estado dos ciclos: [docs/agents/CONTINUE.md](docs/agents/CONTINUE.md).

Skills: `.cursor/skills/siga/SKILL.md`, `siga-web`, `siga-admin`, `siga-docs`, `siga-saas`, `siga-identity`, e `.cursor/skills/siga-*/SKILL.md` por módulo escolar.

**Identidade Digital (domínios, e-mail, subdomínios):** skill `siga-identity` + docs em `docs/domains/`, `docs/email/`, `docs/cloudflare/`, `docs/multi-tenant/`, `docs/provisioning/`.

Auto-construção:

```sh
npm run siga:check
npm run siga:sql
npm run siga:scaffold -- <modulo> [--route=/caminho] [--with-page]
```

No SGA não aplicar migrações Lovable. SQL correcto: `npm run siga:sql`.

