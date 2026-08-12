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

Handoff e estado dos ciclos: [docs/agents/CONTINUE.md](docs/agents/CONTINUE.md).

Skills por módulo (ler o do domínio antes de editar): `.cursor/skills/siga/SKILL.md` e `.cursor/skills/siga-*/SKILL.md`.

Auto-construção:

```sh
npm run siga:check
npm run siga:sql
npm run siga:scaffold -- <modulo> [--route=/caminho] [--with-page]
```

No SGA não aplicar migrações Lovable. SQL correcto: `npm run siga:sql`.

