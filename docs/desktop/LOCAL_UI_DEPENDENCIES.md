# SIGA Desktop — levantamento da interface escolar local

Data: 25/10/2026 · Issue [#289](https://github.com/fernandotunas6-bot/onsoft-replica-dev/issues/289)
· dependência: PR [#288](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/288).

## Diagnóstico confirmado no código

A versão Tauri **1.2.2** empacota o frontend da central `desktop/`
e agora uma pré-visualização escolar local, pública e sem dados pessoais.
`desktop/vite.config.ts` tem três entradas HTML locais: `main`,
`quick-pane` e `offline-shell`.
`src-tauri/tauri.conf.json` aponta `frontendDist` para `../desktop/dist`.
`src-tauri/src/school/mod.rs` cria a janela `school` com
`WebviewUrl::External("https://portal-siga.com")`, sujeita às permissões
restritas de `src-tauri/capabilities/school-portal.json`.

A aplicação escolar principal é **TanStack Start + Nitro**: `vite.config.ts`
usa por omissão `cloudflare-module`, `src/router.tsx` monta as rotas e
`src/routes/__root.tsx` estabelece a autenticação e o contexto institucional.
As chamadas `createServerFn` dos módulos dependem de autenticação e dados
processados pelo servidor. **Copiar `src/routes` para `desktop/` não criaria
uma aplicação escolar offline funcional.**

Levantamento de caminhos em `main` no início da fase: **126** ficheiros
de rotas TypeScript, dos quais **55** em `src/routes/api/`. Estes valores são
uma fotografia do repositório, não garantias de capacidades offline.
O comando abaixo recalcula e lista as dependências ao longo do desenvolvimento.

```bash
node scripts/desktop/offline-inventory.mjs --json
node scripts/desktop/offline-inventory.mjs --check
```

## Contratos mínimos antes de converter uma página escolar

1. Separar apresentação, leitura cacheada e mutações do backend remoto por
   interface de repositório, mantendo os esquemas Zod e as regras de domínio.
2. Fazer bootstrap inicial **autenticado e online**, limitado aos dados e
   permissões realmente atribuídos à escola e ao actor no servidor.
3. Executar as páginas já migradas com `WebviewUrl::App` **numa janela nova
   e capability própria**; o portal remoto não deve herdar capacidades
   privilegiadas de ficheiros, shell, Store ou Stronghold.
4. Acesso offline apenas a dados previamente autorizados, com cifragem,
   retenção e expiração. Nunca incluir service role ou segredos Cloudflare.
5. Leitura de escola A nunca pode renderizar cache de B; alterações locais
   usam identificador de operação, revisão e reconciliação no servidor.
6. Rotas de tesouraria, pagamento, emissão fiscal e alterações de permissão
   não são habilitadas offline nesta primeira fase.
7. Testes de acesso em Windows, macOS e Linux sem Internet devem demonstrar
   o arranque, navegação, preservação local e recuperação com rede antes de
   redireccionar a janela `school` actual para o bundle.

## Estratégia recomendada

Implementar primeiro uma **shell escolar estática, de entrada local**, sem
dados privados persistidos, separada da central nativa já existente.
Depois migrar uma página institucional de leitura por vez (por exemplo,
calendário/salas), utilizando adaptadores explícitos em vez de tentar executar
server functions no WebView. Só então introduzir SQLite cifrado e migrar
as escritas de presença/notas sob contratos de idempotência e conflito.

**Estado:** inventário executável e critérios de separação preparados; a
primeira janela estática `offline-shell` usa um bundle separado e uma capability
mínima (`src-tauri/capabilities/offline-shell.json`), sem autenticação nem
persistência, e só demonstra que uma interface instalada abre sem rede.
A cache v2 do portal escolar persiste unicamente metadados de anos e períodos
validados para a escola activa; não é uma base local completa nem passa dados
privados para a pré-visualização.
**Não** foi criado bundle escolar funcional completo nem activada base SQLite. Nenhum
contrato de produção foi alterado.
