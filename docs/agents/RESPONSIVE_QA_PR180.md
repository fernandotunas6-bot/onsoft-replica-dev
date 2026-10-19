# SIGA Plus — Homologação responsiva PR #180

## Estado e âmbito

- Ramo: `fix/responsive-shell-mobile-desktop-20261019`.
- Este trabalho apenas refina componentes já existentes; **não** modifica módulos, dados, regras académicas, RLS, migrações nem produção.
- O CI de lint, tipos, Vitest e build **não prova** a aparência de uma sessão autenticada.
- A PR fica em draft até aprovação visual com sessões reais **autorizadas** num staging isolado.

## Inspecção automática opt-in (Playwright)

O teste `tests/e2e/responsive-auth.spec.ts` é intencionalmente **ignorado por omissão**. Para executar numa cópia local do SIGA ligada a um staging autorizado, com sessão Playwright obtida pelo responsável desse ambiente:

```bash
VITE_SIGA_URL=http://127.0.0.1:3006 \
SIGA_RESPONSIVE_E2E=1 \
SIGA_RESPONSIVE_AUTH_STATE=tests/e2e/.auth/admin.json \
npx playwright test tests/e2e/responsive-auth.spec.ts --project=chromium
```

- Colocar o `storageState` apenas em `tests/e2e/.auth/` (ignorado pelo Git). **Nunca** adicionar cookies, tokens, ficheiros de sessão ou screenshots contendo alunos a commits/PRs.
- Executar separadamente com sessões autorizadas de **Administrador, Professor e Aluno**. Não partilhar a mesma sessão entre perfis.
- Apenas `localhost` e `127.0.0.1` são aceites como origem de teste. Uma sessão expirada deve falhar explicitamente, e não produzir resultados verdes.
- O teste navega por páginas e abre o contexto e notificações, sem guardar alterações. Não activa migrações ou pagamentos e não envia comandos de escrita.
- Capturas são **desligadas** por omissão. Só definir `SIGA_RESPONSIVE_CAPTURE=1` em ambiente autorizado e protegido. As imagens ficam em `test-results/`, ignorado pelo Git. Rever e eliminar ficheiros sensíveis após análise.
- Para verificar a colisão de barra Guardar e atalho de mensagens numa rota que já apresenta a SaveBar, acrescentar `SIGA_RESPONSIVE_FORM_PATH=/rota-autorizada`. Sem essa rota, esse teste específico fica ignorado.
- Não adicionar `SIGA_E2E_LIVE=1`: os testes responsivos não precisam de dados de escrita nem de service role.

## Matriz de ecrãs e comportamento

| Largura | Contexto | O que comprovar |
| --- | --- | --- |
| 320px | telemóvel estreito | cabeçalho, área de toque, "Mais", títulos e botões visíveis |
| 375px | telemóvel | menu inferior, campos e "Guardar" sem colisão com mensagens |
| 390px | telemóvel | mudar contexto, notificações, scroll e regressar |
| 768px | tablet | navegação compacta, tabelas e modais sem recorte |
| 1024px | portátil pequeno | header desktop, chat por Sheet e pesquisa |
| 1280px | portátil | listas, tabelas, ações e painel flutuante |
| 1536px | desktop | coluna lateral direita, conteúdo e barra superior |
| 1920px | desktop grande | proporções, alinhamento, conteúdo e botões de janela |

**Verificação manual adicional** (não automatizada em Chromium): Safari iOS, Chrome Android, Windows/macOS, zoom 200%, orientação vertical/horizontal, teclado virtual e tema escuro. O Playwright Chromium não substitui estes dispositivos.

## Fluxos com sessão autorizada

1. Administrador: seleccionar ano/período, pesquisar, abrir notificações, consultar tabelas, abrir modal de formulário e regressar sem escrita.
2. Professor: consultar as páginas permitidas, trocar de turma/período, abrir tarefas e agenda, verificar menus conforme permissões.
3. Aluno: consultar apenas a própria informação, tarefas, resultados e propinas no modo de leitura.
4. Duas escolas: confirmar identidade escolar em todas as vistas; testar troca de escola numa sessão isolada sem dados de produção.
5. Sem vínculo e sessão revogada: verificar se a interface apresenta o fluxo de acesso adequado e nunca dados em cache de outra escola.

## Critérios de aprovação

- Nenhuma rolagem horizontal no **documento**; tabelas com rolagem apenas dentro da sua área própria.
- Nenhum botão ou campo inacessível devido a navegação fixa, safe area, teclado ou modais.
- Cabeçalhos, seletores, notificações, chat e formulários com foco visível e navegação por teclado.
- Funcionalidades e identidade visual anteriores mantidas.
- CI verde para o último commit da PR e evidência visual autenticada para todos os perfis, sem resultados fictícios.
- PR #132, migrações e produção mantidas separadas até autorização explícita.
