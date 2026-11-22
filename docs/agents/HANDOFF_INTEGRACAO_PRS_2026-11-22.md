# Integração dos PRs pendentes — 22/11/2026

Pedido do proprietário: «continua resolvendo tudo, corrigir os conflitos do PR e resolver
todos os PR pendentes». Ramo `claude/funny-keller-i4dgj0` (base `main` `b581530`, com as
correcções da [análise 22](../auditoria/22-analise-critica-sistema-2026-11-15.md) e o PayFlow
desactivado). **Sem merge na `main`, sem deploy, sem SQL aplicado.** Os ramos dos PRs não foram
alterados: cada um foi integrado ou portado para este ramo.

## Decisão por PR

| PR                                   | Estado antes                      | Decisão                                          | O que entrou                                                                                                                                        |
| ------------------------------------ | --------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| #118 — ciclos de matrícula           | rascunho, sem conflitos           | **Integrado, com a regra desligada por omissão** | Ciclos em Definições › Matrícula, filtro «Sem matrícula» em `/alunos`, data de início do ano nas matrículas antecipadas, gatilho SQL por aplicar.   |
| #130 — SIGA AI local                 | rascunho, 1 conflito              | **Integrado, adormecido**                        | Módulo completo (Ollama/Qdrant). `dormant: true`: escondido do menu de todas as escolas até uma o ligar.                                            |
| #210 — cobrança configurável         | 18 conflitos, 1 223 commits atrás | **Portado só o que faltava**                     | Editor dos descontos por periodicidade no ADMIN (`/api/saas/billing-settings`). O resto foi refeito na `main` com outro desenho.                    |
| #206 — camada de conteúdo do website | 10 conflitos                      | **Resolvido o objectivo, sem fundir**            | Chaves estáveis dos campos editáveis, sem mudar nenhuma chave existente; correcção do menu em 3 páginas de cursos; ensaio SQL de `school_settings`. |

### #118 — porque desligado por omissão

A regra do PR fecha as matrículas novas durante **qualquer** período de aulas, mesmo sem ciclos
marcados. Integrada assim, a Secretaria de todas as escolas deixava de matricular a meio do
ano no dia da publicação. Passou a depender de um interruptor por escola («Fechar as matrículas
novas fora dos ciclos e durante os períodos de aulas», `school_settings` domínio `enrollment`,
`enforce: true`), lido pelo servidor (`parseEnrollmentEnforcement`) e pelo gatilho SQL (em
`jsonb`: valores estragados contam como desligado). Com o interruptor ligado, o comportamento é
o do PR. Se o proprietário quiser a regra ligada para todas as escolas, basta mudar a omissão
em `parseEnrollmentEnforcement` e no gatilho.

### #210 — o que não foi portado e porquê

A `main` já tem periodicidades com desconto, pausa com motivo e isenção por escola
(`tenant_billing_profiles`, `tenant-billing-rules.ts`) e a configuração inicial em
`/configuracoes/inicio`. Faltava apenas onde editar os descontos globais que o cálculo já lia
de `saas_billing_settings.periods`. Ficaram de fora: o interruptor global de cobrança, os dias
de experiência e o aviso (campos que nada na `main` lê), `/configuracao-inicial`, o redesenho
da área de assinatura e o «Ver mais» dos pacotes.

### #206 — porque não foi fundido

O PR trocava a chave de todos os 4 710 campos editáveis (de um contador para o texto). Na
`main`, uma publicação com chaves desconhecidas falha a validação (`validateWebsiteDraft`), por
isso fundi-lo partia os websites publicados das escolas; e a reestruturação do conteúdo em JSON
(#205) obrigava a refazer à mão, na nova estrutura, tudo o que a `main` mudou no modelo desde
21/10 (propinas do ISPAB, Kursinha, privacidade).

Resolvido de outra forma, em `painel/escolas/scripts/content-manifest.mjs`: as chaves que já
existiam ficam congeladas em `painel/escolas/content-keys.json` e um campo novo recebe a chave
pelo texto (o esquema da #206). O manifesto sai igual (versão `2059d24156c34d54e56e`): o
`template.json` não muda e nenhum rascunho ou publicação precisa de migração. Ao testar
apareceu um defeito que já existia: em 3 páginas de cursos o menu tinha as chaves deslocadas
(60 textos com chave diferente consoante a página). Ficou corrigido.

**Para quem mudar o modelo do website:** um texto novo ganha chave própria sem mexer nas
outras; mudar o texto de um campo muda a chave desse campo (como na #206). Não apagar nem
regenerar `content-keys.json` sem razão: é ele que mantém as chaves antigas.

## Obrigações do proprietário (SQL no SQL Editor, por esta ordem)

1. **Escrita académica (P0 da análise 22):** `docs/agents/SIGA_aplicar_escrita_academica_2026-11-15.sql`
   se a produção não tiver as três funções. Sem elas, o lançamento de notas falha.
2. **Ciclos de matrícula (#118), opcional:** `docs/agents/SIGA_aplicar_ciclos_matricula.sql`.
   Com a regra desligada por omissão, aplicá-lo não muda nada até uma escola a ligar; serve para
   a base aplicar a mesma regra a quem chame a API directamente.
3. **SIGA AI (#130), só se for para usar:** `20261012160000_siga_ai_module.sql` e
   `20261112090000_module_catalog_siga_ai.sql` (ver `docs/siga-ai/README.md`), mais o servidor
   de IA da escola. Sem eles, nada muda para as escolas.

## Depois do merge na `main`

- Fechar #118, #130, #206 e #210 com uma nota a apontar para esta integração (os ramos ficam no
  GitHub).
- Lembrar que o merge publica em produção: o PayFlow passa a responder «desactivado» e o
  website escolar passa a ter a CSP obrigatória.

## Verificação

Medido localmente sobre `310bb54`:

- Vitest: 6 556 testes passaram e nenhum falhou (25 ignorados).
- `tsc` e ESLint: 0 erros.
- Ensaios SQL (PGlite): 56/56.
- Modelo do website: 14/14 testes; `check` passou com 68 páginas e 4 710 campos.
- Build do SIGA e do ADMIN: sem erros.

Aberto para revisão como PR #445.

**GitHub Actions parado desde 16/11/2026.** Todos os jobs acabam em 3–4 s sem runner e sem
registo, incluindo os agendados da `main` sobre o mesmo commit `b581530`, que passavam até
16/11 às 06:39 UTC. A causa está na conta (limite de minutos ou de gastos, ou pagamento) e não
no código. Enquanto durar, o CI não corre e **um merge na `main` não publica**: a publicação
contínua e a vigilância também correm no Actions. Depois de resolvido, voltar a correr as
verificações do PR #445 antes do merge.
