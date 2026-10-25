# SIGA Plus — passagem da Fase 2 ao Claude Code (25/10/2026)

> **Instrução ao agente seguinte.** Este documento faz parte da PR #277, na branch
> `feat/website-studio-puck-20261024`. Não inicia uma sessão de Claude
> automaticamente. Antes de actuar, confirmar os SHAs e comentários actuais no
> GitHub. Não assumir que os estados abaixo continuam válidos depois de novos commits.

## Missão

Continuar o **Website Studio institucional**, preservando a arquitectura
React/TanStack, Supabase/Cloudflare, template existente da escola, Puck lazy,
PWA/desktop, isolamento entre tenants e o contrato visual mestre.
**Não criar outro editor**, nem reescrever `WebsiteDraft`, nem substituir as
áreas académicas, financeiras ou de identidade. Avançar com commits pequenos,
testados e reversíveis, em branches existentes apenas onde o escopo o exige.

## Estado confirmado e dependências

- **PR #275**: publicação pública por escola; base `main`; draft e CI
  aprovado no merge `ffcc250147c328a27a1cf2f3426455c3bc9fe0ca`.
  As APIs públicas de blog e conteúdos passaram a usar `getPublicSiteBlock`
  para manter a instituição activa acessível em `past_due` ou trial vencido;
  suspensão/arquivo/cancelamento continuam bloqueados.
- **PR #277**: Website Studio privado em `/website/editor`, baseada na #275.
  O ramo foi sincronizado com a base pelas PRs auxiliares **#313 e #315**;
  #275 recebeu a `main` actual pela auxiliar **#314**. Nunca repetir esses
  merges sem comparar HEADs.
- **Nova correcção #277**: os botões «Guardar rascunho» e «Publicar», o
  atalho Ctrl/Cmd+S e a função `act` recusam gravação/publicação quando
  a vista «Ver publicação» está activa. Voltar ao rascunho reabilita a edição.
  Commits `376c73b8`, `6efdd39e`, `5a7c4d66`, `c683d7ad`,
  `c16b3826`. O teste fica em
  `tests/school-website/studio-ui.test.tsx`.
- **PR #291**: draft da Fase 1, staging/E2E, auditoria de resíduos e inventário
  financeiro read-only. Não foi integrada em `main`; contém o roteiro das
  cinco fases e `docs/implementation/FINANCE_MIGRATION_DRIFT_2026-10-25.md`.
- **PR #276 → #283**: ordem financeira obrigatória. #276 está aberta e
  assinalada com conflitos em comparação com `main`; #283 depende da #276.
  As tabelas e gatilhos de caixa de #283 já foram observados na produção mas a
  versão `20261024110000` não consta do histórico das migrações. A função de
  estorno instalada também não reflecte a correcção de multas de #276.
  **Não executar migrations, reparar histórico nem processar pagamentos**.
- **PR #287 (senhas)** e **#288 (Tauri)** já foram integradas em `main`.
  O merge de Tauri não representa funcionamento totalmente offline.

## Próxima execução — obrigatória e pela ordem segura

1. Ler `AGENTS.md`, `docs/agents/CONTINUE.md`,
   `docs/design/VISUAL_MASTER_2026.md`,
   `docs/design/SIGA_VISUAL_MASTER_2026-10-23.md` e
   `docs/qa/website-studio-2026-10-24/SYNC_2026-10-25.md`.
   Recolher novo estado das PRs **#275, #277, #291, #276, #283**.
2. Verificar os checks **do último SHA** da #277. No último ponto da execução
   os testes Vitest já tinham passado e o CI principal aguardava PGlite; não
   marcar o CI como aprovado sem a conclusão do workflow. Se houver falha,
   recolher o log e corrigir apenas a causa reproduzida, com novo commit.
3. Exercitar o teste da vista publicada com Puck real e confirmar visualmente:
   rascunho alterado, «Ver publicação», Guardar/Publicar desactivados,
   Ctrl/Cmd+S sem request, e «Voltar ao rascunho» preservando o conteúdo
   local. Cobrir também publicação inicial e múltiplos cliques rápidos.
4. Rever `src/features/school-website/studio/WebsiteStudio.tsx`,
   `PublicationReview.tsx`, `content-server.ts`, `content-http.ts`,
   `blog-http.ts` e as rotas públicas. Guardar rascunho **não publica**.
   Publicar exige revisão explícita, revisão esperada, sessão e escola
   autorizadas, Admin exacto e MFA AAL2 **no servidor**. Nunca confiar apenas
   em botões desactivados no browser.
5. Validar isolamento **A/B**, incluindo alternância de escola,
   desmontagem/cancelamento de leitura, respostas atrasadas, cache por
   conta/escola, visitantes anónimos, rascunhos privados e estado de
   suspensão da escola. Examinar CSP, URLs/imagens e origem opaca da
   pré-visualização. Não reduzir permissões de segurança para passar testes.
6. Executar lint, typecheck, build, testes dirigidos a
   `tests/school-website/*`, a suite Vitest e os ensaios SQL com PGlite,
   utilizando o lockfile existente. Confirmar Android e iOS em larguras
   390/768 px e desktop em 1024/1440 px, foco, teclado, scroll, escape,
   navegação, layout compacto e `prefers-reduced-motion`.
7. Staging Supabase **independente e autorizado** ainda está em falta.
   Não utilizar projecto inactivo como staging sem verificar propriedade,
   estado e dados. Não usar credenciais reais nem produção nos E2E
   destrutivos. Até existir staging, registar explicitamente que
   Administrador+AAL2 real, RLS A/B, domínio canário e publicação/revogação
   remotos **não foram homologados**.
8. Quando o CI estiver verde, documentar o resultado com SHA e comandos na
   PR #277 e actualizar a matriz de implementação/QA. **Não fazer merge na
   `main`, deploy Cloudflare, alterações DNS, migrações Supabase ou limpeza
   de dados sem aprovação específica e evidências dos gates.**

## Contrato com os outros agentes

- Trabalhar no ramo **#277** para Website Studio e na base **#275** apenas
  se for necessária uma correcção de publicação institucional partilhada.
  Não alterar a base das PRs financeiras com uma alteração do Studio.
- Sem force-push/rebase de commits publicados: este repositório sincroniza com
  Lovable. Não misturar propostas antigas de `school-site` com o domínio
  `school_website`.
- Manter aparência actual do website escolar, o visual mestre do SIGA e
  contratos de API/BD. Não acrescentar informação burocrática ou componentes
  desnecessários.
- Registar observações e commits na **PR #277** e, quando um bloqueio afecte
  a sequência global, na **PR #291**. O outro agente não deve presumir que
  este documento o activou: é uma passagem verificável de contexto.

## Definição de concluído

CI do último commit integralmente verde **e**, separadamente, homologação
autorizada de sessão Admin+AAL2, duas escolas, visitante anónimo, publicação,
revogação, permissões SQL e domínio canário. Sem estes testes remotos, manter
a PR #277 em **draft**, mesmo que Vitest, PGlite e build passem.
