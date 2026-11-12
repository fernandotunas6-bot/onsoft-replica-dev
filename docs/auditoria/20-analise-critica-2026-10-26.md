# SIGA Plus — Análise crítica (26/10/2026)

Continua a [17](./17-analise-critica-sistema-2026-10-22.md) (22/10). Cobre segurança, funcionalidades,
velocidade, lógica funcional, lógica pedagógica, navegação e eficiência. Os números são medidos hoje,
salvo onde se diz o contrário. Os limites estão no fim.

## Em uma frase

O código está a ficar mais seguro e mais rápido de escrever. O que falha agora não é a escrita, é a
**integração**: modelos de dados duplicados, leituras que cortam sem avisar, escritas em vários passos
sem transacção, e quatro agentes a trabalhar no mesmo repositório sem um ponto único de entrada. Os seis
achados da revisão do ChatGPT de hoje são todos destas quatro famílias.

## Números de hoje

|                                     | 22/10             | 26/10                                          |
| ----------------------------------- | ----------------- | ---------------------------------------------- |
| Ficheiros versionados               | 4371              | **4793** (+422 em 4 dias)                      |
| Rotas                               | 123               | **132**                                        |
| Declarações `createServerFn`        | 497               | **550**                                        |
| Ficheiros de teste                  | —                 | **715**                                        |
| Migrações em `supabase/migrations/` | 238               | **262**                                        |
| Workflows de CI                     | 15                | **19**                                         |
| Ramos remotos                       | 70                | **80**                                         |
| PRs abertas / rascunhos             | 28 / 15           | **29 / 17**                                    |
| PRs fundidas desde 22/10            | —                 | **100** (o máximo da consulta: podem ser mais) |
| `estudo/yft-school-system`          | 90 ficheiros Dart | **342 ficheiros, já na main**                  |

## 1. Cibersegurança

**O que melhorou e se mantém:**

- O portão das _server functions_: cada uma tem guarda ou fica na lista de públicas com a razão escrita.
- RLS em todas as tabelas.
- 2FA nas escritas sensíveis.
- A catraca ARQ-01 sobre o cliente privilegiado.

As contas de aluno de hoje entram com senha provisória, troca obrigatória no primeiro acesso e o sinal
guardado em `app_metadata`, que só o servidor escreve.

**O que continua por resolver:**

1. **A CSP não protege.** Está em `content-security-policy-report-only`, com `script-src 'unsafe-inline'`:
   só regista violações, não bloqueia nenhuma. Os restantes cabeçalhos estão bem: HSTS com subdomínios,
   `nosniff`, `SAMEORIGIN`, `Referrer-Policy` e `Permissions-Policy`. Passar a CSP a obrigatória exige
   primeiro tirar os scripts em linha, ou usar _nonces_.
2. **A autorização vive no código, não na base.** A app lê com `service_role` (`rolbypassrls`). O RLS é
   defesa de segunda linha para quem chega à API por fora. Cada guarda em TypeScript é a única barreira
   da sua leitura, e o portão prova que o guarda existe, não que está certo.
3. **O segredo do Google OAuth continua no disco** (`client_secret_370295090078-….json`, no checkout
   principal). Foi exposto numa conversa a 25/09 e não há registo da rotação. Rotacionar primeiro,
   apagar depois.
4. **Segredos colados em conversas: cinco episódios.** O último foi a 25/10, com a `service_role`. É
   uma prática, não um ficheiro: nenhuma correcção no repositório a resolve.
5. **Passwords comprometidas (HIBP):** exigem o plano Pro do Supabase. O aviso do _advisor_ não se
   resolve com um interruptor.

## 2. Velocidade e tempo de resposta

Medido deste computador, em Luanda, com 6 pedidos por endereço:

|                                   | DNS   | TCP    | TLS    | Servidor   |
| --------------------------------- | ----- | ------ | ------ | ---------- |
| `portal-siga.com/` (SSR)          | 7 ms  | 208 ms | 287 ms | **457 ms** |
| `/pessoas` (SSR)                  | 6 ms  | 205 ms | 256 ms | **441 ms** |
| `manifest.webmanifest` (estático) | 16 ms | 213 ms | 435 ms | 290 ms     |

- **O tempo vai sobretudo na rede.** A Cloudflare atende em Barcelona (`cf-ray …-BCN`): cerca de 205 ms
  de ida e volta antes de qualquer trabalho. O SSR acrescenta só uns 160 ms ao de um ficheiro estático.
  Para um utilizador em Angola, cada pedido ao servidor custa pelo menos uma volta a Espanha.
- **Por isso o que pesa são as idas sequenciais à base dentro de cada _server function_.** O padrão
  comum faz 4 a 6 consultas em série: `listStudentAccounts`, por exemplo, faz 5. Cada consulta ao
  Supabase dentro de um `await` que não podia correr em paralelo é latência pura.
- **A página de entrada carrega 40 ficheiros: 1232 KB, ou 351 KB comprimidos.** Os maiores são
  `framework` (110 KB gzip), `client` (56 KB), `styles` (49 KB) e `schemas` (25 KB gzip, 91 KB em bruto,
  só de validações). O maior pedaço carregado a pedido é `website-preview`, com 2,1 MB, só no editor
  do website.
- **O Lighthouse continua a medir só o ecrã de entrada**, porque as 7 URLs desenham todas o login. Não
  há medida automática das páginas autenticadas.

## 3. Funcionalidades

- **Entraram em 4 dias:** contas de acesso dos alunos e primeiro acesso; organização de turmas por
  idade com listas e ID do aluno; trabalhos e entregas com anexos, papel com foto e nota na pauta;
  pacote financeiro; módulos adormecidos.
- **Estão à espera em PRs abertas:**
  - horários completos do Codex (#338, em conflito até hoje);
  - presenças do professor na sala (#340);
  - página de ficheiro (#337);
  - motor de contexto (#332);
  - rotas do RH e do Alumni (#344).
- **Continuam com zero linhas na produção** (medido a 25/10): presenças, RH e folha, pagamentos online
  e alumni. A recomendação de 22/10 mantém-se: escolher um para piloto numa escola real e declarar os
  outros como não suportados.

## 4. Lógica funcional — as quatro famílias de defeito

Os seis achados de hoje, todos reproduzidos e corrigidos no PR das correcções, não são casos soltos.

1. **Dois modelos de dados vivos para a mesma coisa.**
   - Presenças: `attendance_records`, que ninguém escreve, e `siga_attendance_records`, a chamada actual.
   - Notas: `grade_scores` (21 referências no código) e `siga_assessment_scores` (12).

   O código novo escolhe a tabela errada com facilidade: foi o que aconteceu na organização de turmas.
   **Acção:** marcar cada tabela antiga como só leitura, ou como morta, num registo que um teste verifique.

2. **Leituras que cortam sem avisar.**
   - O PostgREST devolve no máximo 1000 linhas e não dá erro.
   - Hoje havia `.limit(5000)` na organização de turmas, que na prática lia 1000, e `.limit(200)` no
     histórico da disciplina, que alimentava a média.
   - Há **13** `.limit(200)`, **10** `.limit(500)` e **6** `.limit(1000)` em `src`. O utilitário
     certo já existe: `readAllPages` / `readInChunks`.

   **Acção:** um portão que recuse `.limit(N≥200)` em ficheiros de servidor sem um comentário a
   justificar.

3. **Escritas em vários passos sem transacção.**
   - O caso de hoje: devolver um trabalho escrevia a pauta e só depois a entrega.
   - A regra geral: reservar primeiro com uma escrita condicional, e compensar se o passo seguinte
     falhar. Onde a consistência importa (notas, dinheiro), uma função SQL atómica.
4. **Valores ausentes tratados como zero.** `Number(null) === 0`, e a auditoria das notas perdia a
   mudança entre «sem nota» e «0».

## 5. Lógica pedagógica

- **PAP:** o técnico com média positiva saía «APTO (PAP)» sem ter feito a prova, porque nenhum consumidor
  passava a nota da PAP. Agora fica «PENDENTE». Falta onde lançar essa nota: sem isso, a turma técnica
  fica pendente até alguém a registar.
- **Periodicidade:** o histórico do aluno no servidor ignorava os dois trimestres configurados pela
  escola. Os ecrãs já resolviam turma a turma. Corrigido.
- **Turma A com os mais novos.** É uma regra administrativa, e o DP 162/23 só limita a lotação (36, 45
  com autorização, 26 com alunos com deficiência). O efeito pedagógico é **concentrar os repetentes e os
  alunos com idade acima da classe na última letra**, o que cria uma «turma dos repetentes» identificável
  na pauta. A escola deve decidir de forma consciente. Uma opção a considerar: idade como critério
  principal, com equilíbrio de repetentes entre turmas.
- **Mudar de turma depois de haver notas ou presenças** está bloqueado de propósito, e agora vê também a
  chamada actual. A mensagem «organize antes de começarem as aulas» é a regra certa.

## 6. Navegação e contexto

- O contrato visual de 23/10 pede conteúdo em página e só modais pequenos. Ficou cumprido para a ficha
  da pessoa, a nova pessoa e a turma, no trabalho local de 25/10 que não estava em nenhum ramo e foi hoje
  para o GitHub. Páginas dão endereço próprio, botão «voltar» e partilha de ligação, o que um modal não dá.
- **Há três esforços em paralelo sobre as fichas:**
  - o motor de contexto (#332), que altera o `TurmaProfileModal`, apagado pelo trabalho local;
  - a ficha em página (integração de hoje);
  - a página de ficheiro (#337).

  Quem fundir em segundo tem de reconciliar. **Ordem recomendada:** primeiro a integração, porque apaga
  os modais; depois o #332, refeito sobre as páginas.

## 7. Eficiência do processo

1. **Quatro agentes no mesmo repositório**: Claude, Codex, Lovable e Cursor. **Hoje perdeu-se trabalho
   pela terceira vez:**
   - O Codex perdeu alterações a 25/10 às 12:37, numa «reposição externa do Git». É o padrão do
     Lovable, mas não está provado que tenha sido ele.
   - A pasta temporária desta sessão foi apagada duas vezes, com uma worktree dentro.
   - Ficaram cerca de 3000 linhas de trabalho por commitar durante 17 horas no checkout principal, que
     o Lovable repõe sem aviso.

   **Regra:** cada agente trabalha numa worktree em `~/edu/<nome>`, nunca no checkout principal nem na
   pasta temporária, e faz commit e push a cada passo.

2. **Trabalho duplicado:**
   - #339 e #341 sobre o login de alunos;
   - #211 e #148 sobre a numeração;
   - #121 e #144 sobre o mesmo defeito de horário.

   Antes de abrir um PR, comparar com os abertos.

3. **A fila:** 29 PRs abertas, 17 delas rascunhos, e 80 ramos remotos. Fundir 100 PRs em quatro dias
   mostra capacidade de integrar. A fila diz que se abre mais depressa do que se fecha.
4. **O repositório continua a crescer por acreção:** `estudo/yft-school-system` já está na main com 342
   ficheiros, e há 19 workflows. Cada `tsc` e cada `bun install` pagam este peso.
5. **Continua sem _staging_** (o #291 está em rascunho). É o maior multiplicador de risco: as migrações
   e as mudanças de RLS são decididas sem ensaio, e nenhum fluxo autenticado é provado de ponta a ponta
   antes de chegar às escolas.

## Ordem de ataque

1. Fundir as correcções de hoje (achados do ChatGPT) e a integração das páginas.
2. Pôr o #338 (horários do Codex) em dia com a main e revê-lo.
3. Um portão contra `.limit(N)` grande sem justificação, e um registo de tabelas mortas verificado
   por teste.
4. Rotacionar o segredo do Google OAuth e apagá-lo do disco.
5. Passar a CSP a obrigatória: tirar os scripts em linha, ou usar _nonces_.
6. _Staging_, que desbloqueia o E2E autenticado e o Lighthouse das páginas com sessão.
7. Reduzir as idas sequenciais à base nas _server functions_ mais usadas. É onde a distância
   Angola–Barcelona mais se sente.
8. Decidir com a escola o critério da turma A, e onde se lança a nota da PAP.

## Limites desta análise

- **Base de produção não consultada hoje:** o conector do Supabase desligou-se durante a sessão. Os
  números de uso são de 25/10.
- **A latência foi medida de um só ponto:** este computador em Luanda, sem sessão. As páginas
  autenticadas e as _server functions_ não foram medidas.
- **Nenhum fluxo autenticado foi exercido no browser.** As correcções estão provadas por testes
  unitários e de servidor, não em uso real.
- **A contagem de `.limit()` é textual.** Nem todos alimentam totais; é uma lista de candidatos, não de
  defeitos.
