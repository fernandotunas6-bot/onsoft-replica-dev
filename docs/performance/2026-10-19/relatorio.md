# Desempenho SIGA Plus — navegação, cache e arranque

## Resultado medido

O manifesto do build de produção passou de **42 para 36 recursos JavaScript**
pré-carregados pela raiz. O código base baixou de **1 435 872 para 1 077 268 bytes**
(-25,0%); comprimido individualmente com gzip, de **408 642 para 307 394 bytes**
(-24,8%). Estes valores medem recursos do build, **não** uma melhoria percentual
de latência, LCP ou INP. Cada página continua a carregar os seus recursos adicionais.

Numa segunda passagem, o catálogo de temas saiu da raiz (ver abaixo) e os mesmos
36 ficheiros passaram a **977 513 bytes** e **293 074 bytes** em gzip. Acumulado
desde o início do ciclo: **-31,9%** em bytes e **-28,3%** em gzip. Continua a ser
uma medição de recursos do build, não de latência.

| Passagem | Ficheiros da raiz | Bytes | gzip |
| --- | --- | --- | --- |
| Antes do ciclo | 42 | 1 435 872 | 408 642 |
| Depois da separação de código | 36 | 1 077 268 | 307 394 |
| Depois do catálogo de temas | 36 | **977 513** | **293 074** |

Fontes: [inventário anterior](inventory-before.json) e [inventário posterior](inventory-after.json).
`bundle-before.json` é a soma física dos ficheiros existentes na pasta de saída,
incluindo hashes de builds anteriores: não representa tráfego inicial e não foi
usado para calcular os ganhos acima.

## Causas corrigidas

- **Componentes de rota exportados sem consumidores:** `ImportarDadosPage` e
  `SubscriptionDetail` só são usados nas suas próprias páginas. As exportações
  impediam a separação automática de código pelo router. As funções continuam
  nas mesmas páginas, com o mesmo comportamento; só deixaram de ser exportadas.
- **Pré-busca global sem expiração:** o antigo `Set` bloqueava novas tentativas
  depois de uma falha, expiração ou limpeza da sessão. Agora a própria cache
  React Query gere frescura e pedidos em curso.
- **Chaves e parâmetros divergentes:** calendário aquece a escola e o ano usados
  pela página; Pessoas considera pesquisa e filtros persistentes; Documentos usa
  o mesmo limite do consumidor. Arquivos só aquece o código, porque os parâmetros
  de área/pasta/papel só são conhecidos pelo `FileBrowser`.
- **Trabalho ao percorrer o menu:** a intenção espera 80 ms, pode ser cancelada
  e carrega o auxiliar de pré-busca sob demanda. Não há dois mecanismos manuais
  concorrentes a pré-carregar a mesma rota. Não há pedidos especulativos em 2G
  ou poupança de dados; há um máximo de dois em curso.
- **Respostas obsoletas:** a escola da intenção é comparada com a escola da cache;
  leituras recebem o `AbortSignal` da query. Limpeza de sessão, troca de escola,
  ano, destino, saída do item ou desmontagem cancelam trabalho pendente.
- **Rajadas Realtime:** Documentos e Comunicações reutilizam o agrupamento que
  já existia. Enquanto uma leitura lenta decorre, os eventos ficam pendentes;
  uma leitura final actualiza o estado sem cancelar repetidamente a anterior.
- **Catálogo de temas no arranque:** `__root.tsx` monta o `AppearanceProvider`, por
  isso tudo o que `src/lib/appearance.tsx` importa de forma estática entra nos 36
  recursos da raiz. Os catálogos Shadcn e Tweakcn ocupavam **109 833 bytes** — o 4.º
  maior recurso da raiz, **10,2%** da base — e serviam só para o `applyAppearance`
  fazer um `.find()` do tema activo. O estado por omissão tem `shadcnTheme` e
  `tweakcnTheme` vazios: por omissão o catálogo nunca é consultado. Passaram a
  carregar por `import()`; na raiz o pedaço `appearance` desceu a **10 078 bytes** e
  o catálogo ficou em `theme-data` (100 370 bytes), fora dos pré-carregamentos.
  Não há salto novo porque o provider nasce com os valores por omissão e só lê o
  `localStorage` num efeito, depois de montar — o tema de catálogo já antes era
  aplicado depois da hidratação. As camadas que não dependem do catálogo (acentos,
  marca da escola, tema importado, sobrescritas manuais e raio) continuam a ser
  aplicadas no mesmo turno síncrono, e a precedência mantém-se porque a segunda
  passagem recalcula a cadeia inteira. Uma guarda de geração impede que um catálogo
  atrasado escreva as variáveis de um estado já substituído.
- **Refinamento da navegação:** o ponto existente anima por transformação em vez
  de recalcular largura/altura. Os tamanhos visíveis, itens, ícones e percursos
  mantêm-se; movimento reduzido continua respeitado.

## Verificado e deliberadamente não alterado

- **Zod na raiz (56 638 bytes).** O pedaço `types` da raiz é o Zod, batizado assim
  pela heurística de nomes do Vite. Chega ao arranque por oito módulos de funções de
  servidor (`features/auth`, `access`, `school`, `saas`) que os ganchos de raiz
  `use-current-account`, `use-school-settings` e `tenant-context` importam. Os
  esquemas validam a entrada das funções de servidor: retirá-los enfraqueceria a
  validação do servidor, o que a secção 8 do pedido proíbe trocar por velocidade.
  Fica identificado e documentado, sem alteração — tirá-lo do cliente sem perder a
  validação é trabalho de build, não um remendo de import.
- **Fugas de memória.** Os três ficheiros com mais `addEventListener` que
  `removeEventListener` (`stale-build.ts`, `error-capture.ts`, `pwa.ts`) são de
  instalação única no arranque: `attachStaleBuildRecovery()` é chamado uma vez em
  `client.tsx` e `registerServiceWorker()` num efeito de dependências vazias. Não são
  fugas. Os oito ficheiros com canais Realtime têm todos limpeza, e nenhum
  `setInterval` ficou sem `clearInterval`.
- **Bibliotecas pesadas.** `exceljs` (942 kB), `jspdf` (477 kB), `recharts` (593 kB),
  `archiver` (680 kB) e `html2canvas` (318 kB) **não** estão nos 36 recursos da raiz.
  O parsing de Excel (`features/import/engine/parse.ts`) é server-only e entra por
  `import()` dentro de uma função de servidor: não bloqueia a thread principal do
  navegador. Não havia aqui o gargalo do Motor C que o pedido antecipava.

## Método e cobertura

O inventário cobre os **18 módulos canónicos** de `scripts/siga/modules.json`.
Conta hooks/handlers/imports nos ficheiros declarados e recursos no manifesto;
estas contagens não equivalem a pedidos efectivamente executados. Integrações
não tem uma página isolada. Não foram criados módulos ou funcionalidades.

O Chrome local foi usado numa sessão isolada, sem autenticação, em 1440×900 e
390×844. Login/registo, recuperação de foco e mostrar senha foram exercitados
sem submeter formulários. As seis amostras de `browser-current.json` não tiveram
erros JavaScript, overflow horizontal ou CLS medido. As imagens foram inspeccionadas
e as dimensões da interface existente foram preservadas.

Os tempos de `browser-current.json` são de **desenvolvimento**, com compilação e
outras verificações locais em execução. LCP variou de 376 ms a 12 004 ms. Não é
um benchmark de produção, não demonstra a meta de LCP e não permite calcular
percentis reais. `registerMs` inclui automação; também não é INP. O script
repetível regista adicionalmente o intervalo entre clique e frame com o título
actualizado, separado da duração da automação.

Na [segunda medição](browser-final.json), os 12 cliques entre login e registo
mostraram o título actualizado no frame seguinte em **14,5–79,5 ms**, todos abaixo
de 100 ms nesta amostra local. Não é INP p75. Houve novamente zero erros de consola
ou JavaScript, zero overflow e CLS 0. O painel manteve **420 px** de largura no
computador e **360 px** no ecrã de 390 px, em todas as corridas. O LCP desta
medição variou de 1 028 a 9 100 ms no computador e de 1 724 a 2 588 ms no perfil
móvel; continuam a ser resultados de desenvolvimento, não aceitação de produção.

Uma tentativa inicial de medição falhou porque o Vite tinha dependências
pré-compiladas antigas: a página SSR aparecia sem os handlers activos. Reiniciar
com `--force` permitiu confirmar hidratação e alternância de formulários numa
sessão nova. O log antigo também tinha avisos de ciclos de renderização; não se
atribuem a um componente nem se declaram corrigidos sem reprodução controlada.

Não se alteraram clientes Lovable, contratos da base, autorização, RLS, MFA,
regras de pagamentos/notas ou cache pública. Nenhum SQL ou deploy foi executado
neste ciclo de frontend. A análise de dados do mesmo dia está no
[relatório Motor D](motor-d-base-de-dados.md).

## Reproduzir

```sh
npm run build
node scripts/siga/performance-inventory.mjs > /tmp/siga-performance.json
# Com SIGA a responder em localhost:3006 e Chrome instalado:
node scripts/siga/performance-browser.mjs current reports/performance
npx vitest run --maxWorkers=2 tests/lib/route-data-prefetch.test.ts tests/lib/realtime-invalidate.test.ts tests/ui/nav-intent-prefetch.test.tsx tests/lib/appearance-theme-catalogue.test.ts tests/ui/first-paint-budget.test.ts
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
```

O Worker de produção não foi executado neste macOS: o runtime instalado exige
macOS 13.5 ou superior. A alternativa `npx vite preview` sobre o build também não
serve: responde **HTTP 500** por falha de resolução do `@tailwindcss/node` nesse
modo. Por isso **não há nesta execução nenhuma medição de navegador sobre o build
de produção** — os tempos abaixo continuam a ser de desenvolvimento, e as metas de
LCP e INP do dono continuam sem verificação em condições de aceitação. Testes de páginas autenticadas, redes/dispositivos físicos
e percentis de campo continuam a exigir um ambiente compatível, sessão de teste
e dados representativos. Não são substituídos pelos testes locais com mocks.

## Validação

Os 23 testes dirigidos de pré-busca, navegação e Realtime passaram; também passaram
os testes existentes de menu/login, o build final, a verificação de tipos, o lint
(0 erros, 47 avisos), os controlos estáticos de estilo/acessibilidade, o inventário
de 18 módulos e a validação da skill.

**Suite completa no fecho desta execução: 3 611 aprovados, 3 ignorados, 0 falhas**
(524 ficheiros aprovados, 2 ignorados; 447 s). Correu sem credenciais, como o CI —
confirmado com uma sonda: o `vitest.config.ts` não carrega `dotenv` nem `loadEnv`,
nenhum teste carrega o `.env` por si, e `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
`SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY` e `CLOUDFLARE_API_TOKEN` estão todos
`undefined` durante a corrida. Os testes que querem a produção de propósito saltaram
sozinhos. **Nenhuma escrita na produção.**

O catálogo de temas tem cinco testes novos em
[`tests/lib/appearance-theme-catalogue.test.ts`](../../../tests/lib/appearance-theme-catalogue.test.ts):
as camadas independentes do catálogo aplicam-se no mesmo turno síncrono; um tema
Tweakcn e um tema Shadcn escolhidos continuam a ser aplicados; o raio e as
sobrescritas manuais vencem o catálogo que chega depois; e um estado novo substitui
o anterior mesmo com o catálogo a caminho. A guarda da raiz em
[`tests/ui/first-paint-budget.test.ts`](../../../tests/ui/first-paint-budget.test.ts)
foi confirmada a falhar com o import estático antigo, para não ser uma guarda morta.

O teste do aviso offline aguardava três segundos reais e excedeu o limite global
de cinco segundos durante a compilação concorrente. Passou a usar relógio
controlado: confirma que o aviso continua presente aos 2 999 ms e desaparece aos
3 000 ms, sem mudar a duração nem o componente. A repetição dos dois testes desse
ficheiro passou, assim como o seu lint.

Skill canónica: [siga-performance](../../../.cursor/skills/siga-performance/SKILL.md),
também descoberta pelo Codex através de `~/.codex/skills/siga-performance`.
