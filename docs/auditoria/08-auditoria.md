# Auditoria SIGA Plus — 8. Portais e comunicação

**Data:** 2026-09-24 · **Âmbito:** apenas a área 8 · **Sem alterações de código nesta auditoria.**
A correcção de `school_invitations` (`3e60d0b`) saiu desta área e está descrita em 8.1.

Retrato de produção: `supabase/PRODUCTION_SNAPSHOT.json`. Várias afirmações abaixo foram
verificadas **contra a base**, em transacções revertidas — está assinalado onde.

---

## 8.1 Portais de administração, direcção, secretaria, docentes, alunos e encarregados

**Implementado, com quatro portais e não seis.** `portal-engine.ts:40-43` resolve
`Aluno → student`, `Encarregado → guardian`, `Professor → teacher`, e **tudo o resto →
`admin`**. Direcção, secretaria e tesouraria partilham o mesmo portal; a diferenciação
entre elas vive nas permissões por rota (`access-policy.ts`), não num portal próprio.
Não é defeito — é uma decisão de desenho — mas a verificação pede seis e há quatro.

**Achado (P0, corrigido durante esta auditoria): escalada de aluno a administrador.**

`school_invitations` tinha `FOR ALL TO authenticated USING is_school_member(school_id)`, e
a tabela tem `role_code`. Aceitar um convite **concede o papel que lá estiver escrito**
(`access/server.ts:909-926`: procura `roles.code = role_code` e insere em `member_roles`).

A cadeia, verificada contra a produção numa transacção revertida:

1. membro activo cujo único papel é `Aluno` ou `Encarregado` autentica-se;
2. insere por PostgREST um convite com o **seu próprio** email — o que faz a verificação
   anti-sequestro de `:862-868` passar, porque ela compara o email do convite com o da
   sessão —, `role_code = 'admin'` e um `token_hash` que ele próprio escolhe;
3. aceita-o com esse segredo;
4. o passo 5 da aceitação concede-lhe `admin`.

`has_table_privilege('authenticated','school_invitations','INSERT')` era `TRUE`, havia um
só trigger (carimbo de `updated_at`) e uma só `CHECK` (sobre `status`). **A inserção
passou na prova.** Fechado por `20260924170000` e apertado por `20260924210000`; depois da
correcção, a mesma prova dá `42501` na escrita e zero convites visíveis, e um administrador
continua a ver os seus.

## 8.2 Menus, painéis, notificações e acções conforme as permissões

**Implementado, e em duas camadas distintas.** As rotas são filtradas por papel em
`access-policy.ts` (`accessRules`, prefixo → papéis). As **notificações**, essas, não são
filtradas por papel mas por **permissão**, o que é melhor: `private.notify_permission_holders`
(capturada em `20260908210000`) junta `school_memberships → member_roles →
role_permissions → permissions` e só notifica quem tem o código pedido. O gatilho de
factura, por exemplo, notifica quem tem `finance.invoices.read`, e exclui quem a emitiu.

**Achado (P2): `notification_preferences` tem RLS activa e zero políticas.** Confirmado na
base: `politicas = 0`, `rls = true`, e no entanto `authenticated` tem `SELECT` e `INSERT`
concedidos. RLS sem políticas nega tudo, portanto **falha fechado** — não há risco de
exposição. O efeito é outro: a tabela é inalcançável pelo cliente, logo **não há forma de
o utilizador desligar uma notificação**. A tabela tem 0 linhas.

A mesma tabela tem `title`, `body`, `payload`, `status`, `channel`, `event_type` — colunas
de *notificação*, não de *preferência* — mais quatro `*_enabled`. Parece uma cópia de
`notifications` com os booleanos pendurados. As preferências a sério vivem noutra tabela,
`user_communication_preferences`, com oito categorias e `channel_preferences`. **São dois
modelos para a mesma coisa, e o que o motor consulta é o que ninguém consegue escrever.**

`notify_permission_holders` consulta as preferências só como **exclusão**
(`not exists (... in_app_enabled = false)`). Com zero linhas, toda a gente recebe tudo.

## 8.3 E-mails transaccionais, confirmação, recuperação de senha e identidade institucional

**Implementado e bem separado.** Há servidores próprios para recuperação de senha, ligação
mágica e mudança de email (`reset-password-server.ts`, `magic-link-server.ts`,
`email-change-server.ts`), os três a partilhar `fetchSchoolBranding` — a identidade
institucional entra no email, não é o remetente genérico do Supabase. Os modelos são
ficheiros próprios (`email-templates/reset-password.html`).

## 8.4 SMS, WhatsApp e push apenas quando os canais estiverem integrados

**Implementado, e esta é a parte mais bem feita da área.**

Os quatro adaptadores — `ResendOtpAdapter`, `WhatsAppOtpAdapter`, `SmsOtpAdapter`,
`TwilioSmsAdapter` — **falham fechado** quando a configuração não existe: devolvem
`success: false` com a causa (`"RESEND_API_KEY não configurada no servidor."`), em vez de
devolverem sucesso e engolir a mensagem. Num fluxo de OTP isto é a diferença entre "o
código não chegou, e o sistema sabe" e "o sistema diz que enviou e o utilizador fica
trancado à porta".

A cascata (`resolveChannelCascade`) escolhe por tipo de identificador: email → email;
telefone → WhatsApp → SMS. Com os adaptadores a falhar fechado, um canal por configurar
faz a cascata avançar para o seguinte em vez de parar — que é o comportamento correcto.

**Nota:** a memória do projecto descreve `WhatsAppOtpAdapter` e `SmsOtpAdapter` como
*stubs* (2026-09-11). Já não são: ambos fazem pedidos reais e validam a configuração.

**Não existe canal push.** Não encontrei registo de dispositivos nem integração de push; a
verificação admite-o ("apenas quando os canais estiverem integrados").

## 8.5 Fila, reenvio, erros, duplicações e preferências

**Parcialmente implementado, e desigual entre os dois caminhos.**

**No OTP está lá quase tudo:** limite de frequência com dois níveis (60 s de espera entre
envios e 5 por hora, por identificador e IP), cascata de canais como reenvio automático,
registo forense em `communication_dispatches` (`otp-dispatcher.ts:217`), e **webhooks de
entrega** que actualizam o estado a posteriori — Twilio, WhatsApp e Resend, cada um com o
seu manipulador. Um código nunca é guardado em claro (HMAC-SHA256).

**Fora do OTP não há caminho de envio nenhum.** `communication_dispatches` só é escrita
pelo OTP; `communications/server.ts` faz CRUD de anúncios e não envia nada;
`dispatches-server.ts` só lê e agrega. Não há fila de mensagens gerais, portanto também
não há reenvio nem deduplicação a fazer — não há o que enfileirar.

**Achado (P2): as preferências de comunicação não são consultadas por ninguém.**
`user_communication_preferences` tem oito interruptores por categoria (segurança,
académico, financeiro, assiduidade, calendário, avisos, eventos, documentos) e
`channel_preferences`. Não encontrei leitor. O único caminho de envio real — o OTP — é de
segurança e não deve mesmo respeitar preferências; mas nenhum outro canal as lê porque
nenhum outro canal existe.

## 8.6 Comunicação por turma, avisos de faltas, notas, propinas e calendário

**Achado (P1): os avisos existem, mas são todos *in-app*, e não saem do sistema.**

`notify_permission_holders` grava sempre `channel = 'in_app'`, fixo. Os gatilhos que a
chamam — `trg_notify_invoice_issued`, `trg_notify_document_issued`,
`trg_notify_document_request`, `trg_notify_signature_pending`, `trg_notify_grade_sheet` —
criam linhas em `notifications` e nada mais. **Não há ponte entre `notifications` e
`communication_dispatches`**: nada transforma um aviso em email, SMS ou WhatsApp.

**Correcção, de 2026-09-25 — é pior do que aqui estava escrito.** A versão original desta
linha dizia que o encarregado "só fica a saber se entrar no portal e olhar". Isso pressupõe
que, entrando, veria. Não vê: **a tabela `notifications` tem 16 linhas em produção e não é
lida por nada.**

Verificado à mão, depois de o inventário (`npm run siga:inventario`) a marcar como *sem
leitor*: as únicas ocorrências de `notifications` em `src/` são um comentário sobre Firebase
e uma variável de estado `notificationsOpen`. O painel do sino (`AppShell.tsx:487`) mostra
duas coisas, e nenhuma vem desta tabela — `useSchoolAlerts()`, que lê `students` e produz
alertas de configuração, e as mensagens directas por ler.

Ou seja: os cinco gatilhos que escrevem avisos — factura emitida, documento emitido, pedido
de documento, assinatura pendente, pauta — alimentam uma tabela invisível. O aviso não sai
por email nem por SMS, e **também não aparece dentro da aplicação**.

**Achado (P2): `notifications.announcement_id` nunca é escrito.** A coluna existe para
ligar um anúncio às notificações que gerou. `grep` em `src/`: zero ocorrências fora dos
tipos. Criar um anúncio não notifica ninguém.

**Comunicação por turma** existe, mas manual: `messages/guardian-alerts.ts` compõe o
**texto** de avisos de propina e de notas e devolve um `whatsappHref` — um link que abre o
WhatsApp para um funcionário enviar à mão, um a um. É uma ajuda real à secretaria, e é
honesto quanto ao que é; não é comunicação automatizada. `class_groups` tem
`whatsapp_group_name` e `whatsapp_invite_url`, que são referências a grupos geridos fora
do sistema.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P0** | Escalada de aluno a administrador por `school_invitations.role_code` — **corrigido e verificado** | prova revertida contra a produção; `3e60d0b` |
| **P1** | Os avisos não chegam a ninguém: `notifications` tem 16 linhas e **nenhum leitor** — nem sai por email/SMS, nem é mostrada no painel do sino | `notify_permission_holders` (canal fixo `'in_app'`); `AppShell.tsx:487` lê `useSchoolAlerts()` |
| **P2** | `notification_preferences`: RLS sem políticas, inalcançável pelo cliente — ninguém consegue desligar um aviso | `politicas=0`, `rls=true`, 0 linhas |
| **P2** | Dois modelos de preferências (`notification_preferences` vs `user_communication_preferences`); o que o motor lê é o que ninguém escreve | colunas das duas tabelas |
| **P2** | `user_communication_preferences` sem leitor nenhum | `grep` em `src/` |
| **P2** | `notifications.announcement_id` nunca escrito: um anúncio não notifica ninguém | `grep` em `src/` |
| **P3** | Quatro portais para os seis perfis que a verificação lista | `portal-engine.ts:40-43` |
| **P3** | Sem canal push (admissível — a verificação condiciona à integração) | ausência no esquema |

### O que está bem, e vale dizer

Os quatro adaptadores de canal **falham fechado** quando não estão configurados. Num
fluxo de OTP, essa é a decisão que separa um utilizador que sabe que o código não chegou
de um utilizador trancado à porta sem explicação — e é a decisão que mais vezes se vê
tomada ao contrário.

As notificações são dirigidas por **permissão**, não por papel, o que as faz acompanhar
automaticamente qualquer mudança de RBAC. A recuperação de senha leva a identidade da
escola. O OTP tem limites de frequência em dois níveis, nunca guarda o código em claro, e
tem webhooks de entrega dos três provedores.

### A ordem que proponho

1. **Ligar `notifications` a um canal externo.** É o achado que mais pesa: toda a
   maquinaria de avisos está construída e não sai do ecrã. O caminho mais curto é uma
   ponte que leia `notifications` por entregar e despache pelos adaptadores que já
   existem e já sabem falhar fechado.
2. **Decidir qual é a tabela de preferências**, e dar-lhe política. Sem isso, o ponto 1
   entrega tudo a toda a gente sem ninguém poder desligar — o que é pior do que não
   entregar nada.
3. `announcement_id` e o portal por perfil, que são acabamento.

O ponto 2 não é opcional se o 1 for feito: enviar email e SMS a toda a escola sem
mecanismo de recusa é um problema de outra natureza, e em alguns casos legal.
