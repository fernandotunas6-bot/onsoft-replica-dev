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

| Passagem                      | Ficheiros da raiz | Bytes       | gzip        |
| ----------------------------- | ----------------- | ----------- | ----------- |
| Antes do ciclo                | 42                | 1 435 872   | 408 642     |
| Depois da separação de código | 36                | 1 077 268   | 307 394     |
| Depois do catálogo de temas   | 36                | **977 513** | **293 074** |

Fontes: [inventário anterior](inventory-before.json) e [inventário posterior](inventory-after.json).
Atenção ao ler a tabela: `inventory-after.json` foi capturado **antes** da passagem
do catálogo de temas e contém os 1 077 268 bytes da linha do meio, não os 977 513
da última linha. Os valores da última linha foram reconfirmados a partir do
manifesto do build de produção corrente, nos dois presets.
`bundle-before.json` é a soma física dos ficheiros existentes na pasta de saída,
incluindo hashes de builds anteriores: não representa tráfego inicial e não foi
usado para calcular os ganhos acima.

## O ecrã de entrada carrega 73 recursos, não 36

A medição sobre o build de produção permitiu, pela primeira vez, comparar o que o
relatório conta com o que o navegador pede. **Os 36 ficheiros/977 513 bytes são o
`__root__`, não a página.** A rota `/` tem a sua própria lista de recursos no
manifesto do router, e é essa que o ecrã de entrada carrega:

| Lista do manifesto                     | Ficheiros | Bytes         | gzip        |
| -------------------------------------- | --------- | ------------- | ----------- |
| `__root__` (o que a tabela acima mede) | 36        | 977 513       | 293 074     |
| Rota `/` (raiz + acrescento da rota)   | **73**    | **1 567 114** | **474 766** |
| Acrescento só da rota `/`              | 37        | 589 601       | 181 692     |

A rota `/` é o painel, mas desenha o login a quem não tem sessão — e a app serve o
login em todas as páginas a quem não entrou. Isto explica por que medições
anteriores não mexeram a nota: as reduções foram feitas na lista de 36, enquanto o
ecrã medido carrega a de 73 mais o que ela arrasta.

Carregamento frio medido no navegador, sobre o build de produção (corrida 0 de cada
perfil, as seguintes aproveitam a cache do contexto). **Valores por comprimir**: o
servidor Node local não comprime, ao contrário da Cloudflare — ressalva adiante:

| Perfil              | Recursos | Transferido     |
| ------------------- | -------- | --------------- |
| Computador 1440×900 | 110      | 4 101 523 bytes |
| Telemóvel 390×844   | 109      | 2 384 567 bytes |

Os três pesos maiores do ecrã de entrada, por ordem:

1. **`/auth-classroom.mp4` — 1 716 956 bytes**, 42% do carregamento frio no
   computador. É exactamente a diferença entre os dois perfis (4 101 523 −
   1 716 956 = 2 384 567): o telemóvel não o pede. Fica **identificado e não
   alterado** — é o vídeo do ecrã de entrada, elemento da identidade, e a secção
   8 do pedido proíbe remover elementos por bytes. O poster embutido já evita que
   seja o LCP.
2. **`BarChart-BAPBWitz.js` — 369 980 bytes**, o maior script, descarregado no
   ecrã de login. **Corrigido e remedido** (ver abaixo).
3. **`styles-BpcmSTvH.css` — 234 925 bytes.** Não alterado neste ciclo.

### Como 370 KB de gráficos entravam no login apesar do `lazy()`

`src/routes/index.tsx` carrega os gráficos com `lazy(() => import(...))`, como deve.
O que os trazia era outra coisa: o manifesto do router pré-carrega o grafo
**estático** da rota, e `index.tsx` importava `DashboardChartsSkeleton` do mesmo
módulo que importa `recharts`. Isso punha `DashboardCharts-*.js` (17 563 bytes) nos
recursos da rota `/`; o navegador seguia o import estático desse módulo e pedia o
pedaço `BarChart` (369 980 bytes) — que **não** está no manifesto, por isso era
descoberto tarde e ainda assim descarregado. O pior dos dois mundos.

O diagnóstico ficou provado por contraste no próprio manifesto: `/pedagogica`,
`/financeiro`, `/relatorios/academicos` e `/relatorios/financeiros` também carregam
gráficos com `lazy()` e têm **zero** pedaços de gráficos nas suas listas. Só `/`
tinha um — a única rota com uma dependência estática ao módulo dos gráficos.
`AdminPortalDashboard.tsx`, que `index.tsx` importa estaticamente, tinha o mesmo
import do esqueleto.

Correcção: o esqueleto passou para `src/features/dashboard/DashboardChartsSkeleton.tsx`,
marcação pura sem um único import. Mesmo desenho, mesmos componentes, mesmo
`lazy()` para os gráficos; só deixou de haver uma aresta estática do login para o
`recharts`. Guarda em `tests/ui/first-paint-budget.test.ts`, confirmada a falhar com
o import antigo para não ser guarda morta.

Resultado, medido no preset de publicação e depois no navegador. No manifesto, a
rota `/` passou de 73 para **72 ficheiros** e de 1 567 114 para **1 549 942 bytes**,
e já não lista nenhum pedaço de gráficos; o `BarChart-BAPBWitz.js` continua a existir
no build, com o mesmo hash, para as páginas que têm gráficos. No carregamento frio:

| Carregamento frio do ecrã de entrada | Antes                  | Depois                 | Diferença           |
| ------------------------------------ | ---------------------- | ---------------------- | ------------------- |
| Computador 1440×900                  | 110 rec. / 4 101 523 B | 107 rec. / 3 687 643 B | −413 880 B (−10,1%) |
| Telemóvel 390×844                    | 109 rec. / 2 384 567 B | 106 rec. / 1 970 687 B | −413 880 B (−17,4%) |

**Estes bytes são por comprimir e não é isso que um utilizador recebe.** O servidor
Node que serve o build localmente não comprime — confirmado: resposta sem
`content-encoding` e `content-length` igual ao tamanho em disco. A Cloudflare serve
estes recursos comprimidos. Os três que deixaram de ser pedidos são `BarChart`
(369 985 B), `DashboardCharts` (16 951 B) e `PieChart` (25 823 B), que somam 412 759 —
os 413 880 medidos, a menos de 1 121 bytes de cabeçalhos. Comprimidos:

| Os 3 recursos que saíram                    | Por comprimir | gzip        | brotli     |
| ------------------------------------------- | ------------- | ----------- | ---------- |
| `BarChart` + `DashboardCharts` + `PieChart` | 412 759       | **110 362** | **91 808** |

A poupança que chega a um utilizador em produção é da ordem de **110 KB**, não de
414 KB. Pela mesma razão, os totais de 4,1 MB e 2,4 MB da tabela estão inflacionados
para tudo o que é texto; o vídeo (1 716 956 B) já está comprimido e não encolhe, por
isso pesa mais, na proporção, do que a tabela sugere.

O pedaço `BarChart` deixou de aparecer na lista de recursos pedidos, e o total do
tipo `script` caiu de 507 643 para **111 235 bytes** (também por comprimir).
Evidências em [`browser-prod.json`](browser-prod.json) (antes) e
[`browser-prod-after.json`](browser-prod-after.json) (depois).

Nas seis corridas posteriores: zero erros de consola, sem overflow horizontal,
painel com os mesmos 420 px no computador e 360 px no ecrã de 390 px. O LCP veio
mais baixo (472–1 316 ms no computador, 552–620 ms no telemóvel, contra 1 272–2 664 e
604–916 antes), mas **não se atribui essa diferença à correcção**: são seis corridas
locais sem limitação de rede ou CPU, e a medição anterior correu com a máquina
ocupada por outro trabalho. O que a correcção demonstra é a redução de bytes e de
pedidos, que é determinística. O CLS somado passou de 0 para **0,003** nas seis
corridas — muito abaixo do limiar de 0,1, mas registado por não ser já zero.

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
- **Vídeo do ecrã de entrada (1 716 656 bytes), analisado e não alterado.** H.264,
  1280×720, 8,00 s, 1 717 kbps de média. Lido dos cabeçalhos MP4 por falta de
  `ffprobe` nesta máquina. Duas observações para quem decidir mexer:
  - **A faixa de áudio pesa 128 679 bytes (7,5% do ficheiro) numa etiqueta `muted` e
    `aria-hidden`** — nunca é audível. O vídeo em si são 1 573 282 bytes. Tirar o
    áudio não muda um pixel; precisa de `ffmpeg`, que este Mac não tem.
  - O ficheiro tem 1280 px de largura para ser desenhado num painel de ~720 px CSS
    com `object-cover`: ~1,8× a largura necessária. Reencodar para a largura
    desenhada e sem áudio é o maior ganho que resta no ecrã de entrada, e é decisão
    do dono por ser um recurso de marca. Não se tocou no ficheiro: já foi apagado
    uma vez por engano e repô-lo não é trivial.
  - O componente em si já estava bem travado: só ≥ 1024 px, respeita «reduzir
    movimento», atrasa 600 ms, tem poster para não ser o LCP e usa
    `preload="metadata"`. **O `preload` não é lever**: com `autoPlay` o navegador
    descarrega o ficheiro todo de qualquer maneira.
  - Fica uma lacuna por fechar, de uma linha: o travão de rede do vídeo só verifica
    `connection.saveData`, enquanto `canPrefetchResources()` em `src/lib/preload.ts`
    — a política que o resto do ciclo usa para não especular em rede limitada —
    verifica também `effectiveType` em `slow-2g`/`2g`. São 1,7 MB decorativos a
    descer numa ligação que o próprio projecto já considera limitada. Quem não
    receber o vídeo continua a ver o poster, que é o 1.º frame dele: o ecrã fica
    igual, sem o movimento. Não foi aplicado aqui porque o ficheiro estava a ser
    reescrito por outro agente no mesmo directório.
- **CSS da aplicação (234 625 bytes), verificado e não alterado.** Comprime para
  50 617 em gzip e 41 588 em brotli, que é o que a Cloudflare entrega. Continua a ser
  o maior recurso de texto do ecrã de entrada depois da saída dos gráficos, mas a
  grandeza real é de dezenas de KB, não de centenas: não justifica cirurgia no
  Tailwind neste ciclo.
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
# Desenvolvimento, com SIGA a responder em localhost:3006 e Chrome instalado:
node scripts/siga/performance-browser.mjs current reports/performance
# Build de produção servido localmente (os números que valem como medição):
SIGA_NITRO_PRESET=node-server npm run build
PORT=3013 node .output/server/index.mjs &
SIGA_PERF_BASE_URL=http://127.0.0.1:3013 \
  node scripts/siga/performance-browser.mjs prod docs/performance/2026-10-19
npx vitest run --maxWorkers=2 tests/lib/route-data-prefetch.test.ts tests/lib/realtime-invalidate.test.ts tests/ui/nav-intent-prefetch.test.tsx tests/lib/appearance-theme-catalogue.test.ts tests/ui/first-paint-budget.test.ts
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
```

O Worker de produção continua sem correr neste macOS: o `wrangler` exige macOS
13.5 ou superior e este Mac é 12.6. O `npx vite preview` também não serve — procura
o build em `dist/server/`, que este projecto não usa, porque compila para `.output/`.
O caminho que **resulta** é servir a saída do Nitro por Node: `SIGA_NITRO_PRESET`
troca o preset só para medir, o alvo de publicação continua a ser o
`cloudflare-module` por omissão, e a variável nunca deve ser definida num workflow
de publicação. O proxy é válido porque o conjunto de recursos da raiz é o mesmo nos
dois presets no mesmo commit — 36 ficheiros, 977 513 bytes, 293 074 em gzip, com
hashes iguais: só o runtime do servidor difere, o pacote do cliente medido é o que
se publica.

Com isso, [`browser-prod.json`](browser-prod.json) é a primeira medição deste ciclo
sobre o build de produção: seis corridas, CLS 0 e zero erros de consola em todas,
sem overflow horizontal, painel com 420 px no computador e 360 px no ecrã de 390 px.
LCP de 1 272 a 2 664 ms no computador e de 604 a 916 ms no telemóvel; os 12 cliques
entre login e registo mostraram o título novo no frame seguinte em 6,8 a 81,6 ms,
mediana 23,9 ms. A pior duração de evento observada foi 120 ms, numa cadeia de
clique.

O que isto **não** é: não há limitação de rede nem de CPU, a máquina é local, não há
sessão autenticada e seis corridas não dão percentis. Logo **não é INP p75 nem LCP
de campo, e as metas de aceitação do dono continuam sem verificação** em rede e
dispositivo reais. Páginas autenticadas, redes/dispositivos físicos e percentis de
campo continuam a exigir um ambiente compatível, sessão de teste e dados
representativos. Não são substituídos pelos testes locais com mocks.

## Validação

### Continuação — trabalho do painel de acesso fora de vista

Antes, `AuthHeroSlides` mantinha um intervalo de 6 s mesmo abaixo dos 1024 px,
onde o painel está escondido por CSS. `AuthBackgroundVideo` avaliava largura,
movimento reduzido e poupança de dados apenas ao montar: depois de redimensionar
ou esconder o documento, não havia pausa explícita. A verificação passa a acompanhar
essas mudanças e a visibilidade do documento, com limpeza de todos os listeners.
No telemóvel não fica intervalo activo; no desktop, a rotação mantém os mesmos
6 s enquanto visível. O vídeo conserva o poster, o atraso de 600 ms e a mesma
instância ao pausar/retomar, sem repetir tentativas depois de uma falha.

Não foram alterados textos, botões, dimensões, classes visuais ou ficheiros de media.
Os testes de ciclo de vida verificam suspensão, retoma, escolha manual, mudanças
de preferências, desmontagem e falhas. Esta redução de trabalho em segundo plano
não é uma medição de ganho de LCP/INP nem uma estimativa de bateria.

### Verificações do ciclo anterior

Os 23 testes dirigidos de pré-busca, navegação e Realtime passaram; também passaram
os testes existentes de menu/login, o build final, a verificação de tipos, o lint
(0 erros, 47 avisos), os controlos estáticos de estilo/acessibilidade, o inventário
de 18 módulos e a validação da skill.

**Suite completa no fecho desta execução: 3 612 aprovados, 3 ignorados, 0 falhas**
(524 ficheiros aprovados, 2 ignorados; 252 s). A corrida anterior tinha fechado com
3 611 aprovados e **1 falha**, corrigida abaixo; a repetição depois da correcção é a
que vale, e o teste a mais é a guarda nova do ecrã de entrada.

A afirmação anterior de que a suite corria «sem credenciais, como o CI» estava
**errada** e é corrigida aqui. O `vitest.config.ts` de facto não carrega `dotenv`
nem `loadEnv`, mas isso não chega: `tests/security/selects-vs-producao-live.test.ts`
lê o `.env` **do disco** com `readFileSync` e só depois sobrepõe o `process.env`
(`{ ...lerEnv(), ...process.env }`). Numa máquina com `.env`, esse teste sonda a
produção com a chave `service_role` mesmo com as variáveis de ambiente desligadas —
`env -u` não o desarma. São leituras (`select=…&limit=0`), não escritas, e é esse o
propósito declarado do teste; o que estava errado era a descrição da corrida, não o
teste. **Continua a não haver escritas na produção.**

A falha foi `ECONNRESET` nessa sonda, não um defeito do código. O ficheiro já
documentava a regra certa — «"o pedido não chegou ao fim" é ruído ... um teste que
falha ao calhar ensina a ignorar falhas» — mas `sondarComRetentativa` fazia `throw`
à segunda tentativa e pintava a suite de vermelho. Corrigido: três tentativas com
recuo crescente, as sondas que nunca chegam ao fim são contadas à parte e não contam
como achado, e se **nenhuma** das sondas chegar à produção o teste falha a dizer que
não verificou nada — para o ruído não virar cegueira silenciosa.

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
