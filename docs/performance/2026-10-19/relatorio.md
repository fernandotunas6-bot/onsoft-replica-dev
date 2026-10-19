# Desempenho SIGA Plus — navegação, cache e arranque

## Resultado medido

O manifesto do build de produção passou de **42 para 36 recursos JavaScript**
pré-carregados pela raiz. O código base baixou de **1 435 872 para 1 077 268 bytes**
(-25,0%); comprimido individualmente com gzip, de **408 642 para 307 394 bytes**
(-24,8%). Estes valores medem recursos do build, **não** uma melhoria percentual
de latência, LCP ou INP. Cada página continua a carregar os seus recursos adicionais.

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
- **Refinamento da navegação:** o ponto existente anima por transformação em vez
  de recalcular largura/altura. Os tamanhos visíveis, itens, ícones e percursos
  mantêm-se; movimento reduzido continua respeitado.

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
npx vitest run --maxWorkers=2 tests/lib/route-data-prefetch.test.ts tests/lib/realtime-invalidate.test.ts tests/ui/nav-intent-prefetch.test.tsx
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
```

O Worker de produção não foi executado neste macOS: o runtime instalado exige
macOS 13.5 ou superior. Testes de páginas autenticadas, redes/dispositivos físicos
e percentis de campo continuam a exigir um ambiente compatível, sessão de teste
e dados representativos. Não são substituídos pelos testes locais com mocks.

## Validação

Os 23 testes dirigidos de pré-busca, navegação e Realtime passaram; também passaram
os testes existentes de menu/login, o build final, a verificação de tipos, o lint
(0 erros, 47 avisos), os controlos estáticos de estilo/acessibilidade, o inventário
de 18 módulos e a validação da skill. O resultado final da suite completa é
registado no fecho desta execução.

O teste do aviso offline aguardava três segundos reais e excedeu o limite global
de cinco segundos durante a compilação concorrente. Passou a usar relógio
controlado: confirma que o aviso continua presente aos 2 999 ms e desaparece aos
3 000 ms, sem mudar a duração nem o componente. A repetição dos dois testes desse
ficheiro passou, assim como o seu lint.

Skill canónica: [siga-performance](../../../.cursor/skills/siga-performance/SKILL.md),
também descoberta pelo Codex através de `~/.codex/skills/siga-performance`.
