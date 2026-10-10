# Orientação de erros — onde se implementa cada caso

Regra do SIGA: **nenhum erro fica calado e nenhum erro fica sem correcção.** Cada aviso
diz o que correu mal, como se faz correctamente e, quando a pessoa pode, leva-a ao sítio
onde se corrige. Vale no computador, no telemóvel e na app desktop (Tauri).

## As camadas (de onde vem o erro → quem o mostra)

| #   | Origem do erro                                                        | Quem mostra                            | Ficheiro                                    |
| --- | --------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| 1   | Qualquer `toast.error("…")` do sistema (330 chamadas)                 | invólucro do `toast`                   | `src/lib/toast.ts`                          |
| 2   | `catch` de uma acção (`toastActionError(error, "Não foi possível…")`) | o mesmo invólucro                      | `src/lib/action-error-toast.ts`             |
| 3   | Mutação sem `onError` próprio                                         | `MutationCache` global                 | `src/router.tsx`                            |
| 4   | Leitura (query) que falha por **configuração** em falta               | `QueryCache` global                    | `src/router.tsx`                            |
| 5   | Página que não carrega (erro no loader/render)                        | ecrã de erro com botão                 | `src/components/error/RouteErrorScreen.tsx` |
| 6   | Acção crítica sem confirmação recente                                 | `StepUpDialog` (não há aviso por cima) | `src/lib/step-up.ts`                        |
| 7   | Sessão expirada (401)                                                 | volta ao ecrã de entrada               | `src/lib/session-expiry.ts`                 |

O **catálogo** com todas as regras é um só: `src/lib/error-guidance.ts`, testado em
`tests/lib/error-guidance.test.ts` com as mensagens exactas do servidor.

`import { toast } from "sonner"` está proibido pelo lint (`eslint.config.js`): todo o
código importa de `@/lib/toast`, por isso uma chamada nova já sai orientada.

## Os três casos

### 1. Erro de configuração → levar ao sítio certo

O destino é sempre o mesmo do guia de arranque (`src/features/school/setup-guide.ts`).

| Mensagem do servidor (exemplo)                                         | Regra                      | Destino                       |
| ---------------------------------------------------------------------- | -------------------------- | ----------------------------- |
| «Não há ano lectivo activo.» / «Seleccione uma turma com ano lectivo.» | `config.academic-year`     | `/calendario`                 |
| «Não há trimestres…»                                                   | `config.terms`             | `/calendario`                 |
| «Não há plano financeiro activo na escola.»                            | `config.fee-plan`          | Definições → Financeiro       |
| «Dados bancários incompletos (titular, banco e IBAN).»                 | `config.school-banking`    | Definições → Financeiro       |
| «NIF … em falta»                                                       | `config.school-data`       | Definições → Escola           |
| «Sem regra de avaliação para calcular a média.»                        | `config.assessment-model`  | `/pedagogica?tab=modelos`     |
| «O curso não tem anos/classes configurados.»                           | `config.grade-levels`      | `/pedagogica?tab=estrutura`   |
| «Associe disciplinas activas à turma…»                                 | `config.class-subjects`    | `/pedagogica?tab=disciplinas` |
| «Adicione pelo menos uma aula activa…»                                 | `config.schedule-empty`    | `/pedagogica?tab=horarios`    |
| «A sala … está inactiva / sem lotação»                                 | `config.room`              | `/pedagogica?tab=salas`       |
| «O papel pedido não está configurado nesta escola.»                    | `config.role-missing`      | `/acessos`                    |
| «… ainda não tem assinatura / não incluído no plano»                   | `config.subscription`      | `/configuracoes/assinatura`   |
| «RESEND_API_KEY não configurada»                                       | `config.email-provider`    | Definições → Integrações      |
| «VITE_PAYFLOW_URL / método não configurado na AppyPay»                 | `config.payments-provider` | Definições → Integrações      |
| «Configuração Zoom em falta»                                           | `config.zoom`              | Definições → Integrações      |
| «falta aplicar a migração» / «Aplique ….sql» / `PGRST205`              | `config.pending-migration` | `/configuracoes/diagnostico`  |

**Permissões:** o botão só aparece se a conta pode abrir o destino (`canAccessPath`,
registado pelo `AppShell` em `registerErrorGuidance`). Para configuração exige-se também
acesso às Definições — um professor vê o Calendário mas não cria o ano lectivo. Quem não
pode recebe «Se não tiver acesso, peça à direcção…» (ou «ao administrador…»).

### 2. Erro de processo → mostrar a forma certa

| Caso                                         | Regra                                          | Correcção mostrada                       |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| Lançar nota / emitir documento sem matrícula | `process.enrollment-missing`                   | matricular primeiro (botão «Matricular») |
| Turma cheia                                  | `process.class-full`                           | outra turma ou aumentar lotação          |
| Conflito de horário                          | `process.schedule-conflict`                    | mudar dia, hora ou recurso               |
| Registo repetido (`23505`)                   | `process.duplicate`                            | editar o existente                       |
| Apagar algo em uso (`23503`)                 | `process.in-use`                               | desactivar em vez de apagar              |
| Campo inválido (`23514`, `23502`, zod)       | `process.invalid-value` / `process.validation` | corrigir o campo indicado                |
| Ficheiro grande / formato errado             | `process.file-too-big` / `process.file-format` | comprimir; usar o modelo oficial         |
| Registo já fechado/cancelado                 | `process.closed`                               | pedido de rectificação                   |
| Falta seleccionar algo                       | `process.select-required`                      | preencher o campo e guardar              |

Os erros do zod que chegam em JSON (`[{"code":"too_big"…}]`) passam por
`formatMutationError` e saem como «NPP deve ser no máximo 20.».

### 3. Acesso, sessão, rede, limites

`access.two-factor` (→ Perfil › Segurança), `access.no-school` (→ Perfil › Instituições),
`access.denied` / `42501` (peça ao administrador em Acessos), `limit.rate`,
`network.offline`, `network.timeout`. Mensagem técnica sem regra → «Não foi possível
concluir a operação» + Diagnóstico; o texto técnico vai só para a consola.

### 4. Mensagens (chat)

| Caso                                              | Regra                 | O que a pessoa vê                                                                        |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| Aluno/encarregado escreve a quem não é do pessoal | `messages.staff-only` | a quem pode escrever                                                                     |
| Conversa ou contacto já não disponível            | `messages.not-member` | começar nova conversa                                                                    |
| Anexo que não pode partilhar / apagado            | `messages.attachment` | escolher outro ficheiro (→ Arquivos)                                                     |
| Apagar mensagem de outra pessoa                   | `messages.own-only`   | só as próprias                                                                           |
| Envio vazio                                       | `messages.empty`      | escrever ou anexar                                                                       |
| Falha de rede ao enviar                           | —                     | «A mensagem não foi enviada» + botão **Reenviar**; a mensagem fica marcada «Não enviada» |

## Desktop, telemóvel e app desktop

- **Computador:** avisos no canto superior direito, até 4 visíveis, botão de fechar.
- **Telemóvel (< 600px):** largura total, abaixo do entalhe (`safe-area-inset-top`),
  longe da barra inferior; botão «ir corrigir» com 40px de altura. O mesmo problema
  repetido substitui o aviso (id por regra) em vez de empilhar.
- **App desktop (Tauri):** se a janela estiver em segundo plano, o erro também sai como
  notificação do sistema (`notifyNative`).
- **Ecrã de erro de página:** botões empilhados no telemóvel, lado a lado no computador;
  o botão da correcção fica primeiro.

## Como acrescentar um caso (checklist)

1. **Servidor:** a mensagem diz o que falta em linguagem da escola («Não há plano
   financeiro activo na escola.»), nunca o nome da tabela ou variável.
2. **Catálogo:** uma regra em `RULES` (`error-guidance.ts`) — `kind`, `match`, `fix`
   (a forma certa, 1–2 frases), `action` (destino) e `owner` (a quem pedir). As mais
   específicas antes das genéricas.
3. **Teste:** a mensagem exacta em `SERVER_MESSAGES` (`tests/lib/error-guidance.test.ts`).
4. **Ecrã:** use `toastActionError(error, "Não foi possível …")` no `catch`; nada mais.
   Para calar um aviso automático: `meta: { errorToast: false }` na query/mutação; para
   uma mensagem sem correcção: `toast.error(msg, { guidance: false })`.

## Por fazer (fase 2)

- `painel/payflow`, `painel/web` e `painel/admin` têm `toast` próprio (5 ficheiros, ~15
  chamadas) e não partilham `src/lib`. Copiar o catálogo exige um pacote partilhado.
- Validação **antes** de enviar: os formulários que só falham no servidor (ex.: emitir
  fatura sem plano) podem consultar o guia de arranque e desactivar o botão com a mesma
  explicação.
