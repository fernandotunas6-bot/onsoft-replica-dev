# Runbook — falha de webhook EMIS/Unitel

Procedimento de suporte quando o **pagamento foi feito** (terminal, app ou Multicaixa) mas a **fatura no SIGA continua em aberto**.

## Triagem rápida (60 segundos)

```text
Encarregado pagou?
  ├─ Não → orientar pagamento / referência em /faturas
  └─ Sim → fatura ainda open no SIGA?
        ├─ Não (paid) → informar recibo; fim
        └─ Sim → seguir runbook abaixo
```

**Prioridade imediata:** se o dinheiro saiu da conta do pagador, a tesouraria pode **confirmar manualmente** na fatura (`PaymentReferenceCard` → confirmar pagamento) enquanto se investiga o webhook. Isto não substitui corrigir a integração — evita bloqueio operacional.

## Informação a recolher

Preencher antes de escalar:

| Campo | Exemplo |
| --- | --- |
| Escola (slug / hostname) | `colegio-esperanca.portal-siga.com` |
| Canal | Multicaixa (`/gateway/confirm`) ou Unitel (`/unitel/confirm`) |
| ID ou n.º da fatura | UUID ou `FAT-2026-…` |
| Referência EMIS (9 dígitos) | `123456789` |
| Montante pago (Kz inteiros) | `45000` |
| Data/hora do pagamento | |
| HTTP status + corpo JSON do webhook | do portal banco ou logs |
| Comprovativo do pagador | SMS, recibo ATM, captura app |

## Mapa HTTP → acção

Respostas do SIGA (`POST …/gateway/confirm` ou `…/unitel/confirm`):

| HTTP | Mensagem típica | Causa | Quem resolve | Acção |
| --- | --- | --- | --- | --- |
| `401` | API key inválida | `merchantId` ou chave errada no portal | Escola + banco | Copiar `webhookApiKey` de Definições → Integrações; **não** usar entidade EMIS como key |
| `401` | Escola não identificada | Integração inactiva ou key de outra escola | Escola | Reinstalar integração; verificar tenant |
| `400` | Corpo JSON inválido | Portal envia formato errado | Banco / integrador | Validar JSON; Content-Type `application/json` |
| `400` | Modo dev: invoiceId em falta | Simulador sem `invoiceId` | Dev | Adicionar `invoiceId` ao corpo |
| `404` | Fatura não encontrada | UUID errado ou fatura de outra escola | Escola | Confirmar `invoiceId` na fatura SIGA |
| `404` | Plano ou fatura não encontrados | Sem plano `pending_gateway` ou referência errada | Escola | Reemitir referência; criar plano gateway |
| `409` | Referência não coincide | Referência do portal ≠ plano SIGA | Escola + banco | Comparar dígitos; regenerar em `/faturas` |
| `502` | Erro ao liquidar / permissões SGA | RPC `register_payment` falhou | Operador plataforma | SQL SGA; confirmar manual na tesouraria |
| `200` + «já liquidada» | Idempotência | Webhook repetido | — | Normal; verificar recibo existente |
| Timeout / sem resposta | Rede / DNS / TLS | Hostname inacessível, certificado | Operador + escola | Testar URL pública; ADMIN `/domains` |

## Passos por perfil

### Administrador escolar (tesouraria)

1. Abrir `/faturas` → fatura em questão.
2. Ver **Referência EMIS** e montante — comparar com comprovativo.
3. Se pagamento confirmado pelo encarregado: **Confirmar manualmente** (PaymentReferenceCard).
4. Definições → **Integrações** → copiar URL + API key correctas para o banco.
5. Multicaixa: confirmar **Merchant EMIS** (não `99824` em produção).
6. Unitel: URL deve ser `/api/finance/gateway/unitel/confirm`, não a rota Multicaixa.

### Operador SIGA Plus (plataforma)

1. ADMIN `/tenants` — escola activa, subscrição não suspensa.
2. ADMIN `/domains` — hostname `active`, SSL ok.
3. Pedir à escola: slug, `invoiceId`, referência, timestamp do webhook.
4. Reproduzir com simulador (staging):

```sh
npm run siga:gateway-simulate -- --invoice-id=<uuid> [--amount=45000]
npm run siga:gateway-simulate -- --invoice-id=<uuid> --unitel
```

5. Se `502` com mensagem de permissões: escola precisa de SQL SGA (`npm run siga:sql` → `APPLY_IN_SQL_EDITOR.sql`).
6. Registar em ticket interno: tenant_id, school_id, invoice_id, status HTTP, message.

### Banco / EMIS / Unitel (externo)

1. Confirmar URL de callback exacta (hostname público da escola).
2. Confirmar corpo POST inclui `apiKey`, `reference`, `amount` (Kz inteiros).
3. Reenviar webhook de teste com mesma referência e montante da fatura SIGA.
4. Fornecer logs do lado deles (timestamp, HTTP status recebido, corpo resposta).

## Escalonamento

| Nível | Quando | Destino |
| --- | --- | --- |
| L1 | Dúvida de referência ou confirmação manual | Secretaria / tesouraria escolar |
| L2 | `401`/`404`/`409` persistente após verificar Integrações | Suporte SIGA Plus (operador) |
| L3 | `502`, hostname, multi-tenant, SQL SGA | Equipa técnica plataforma |
| L4 | Portal banco não envia webhook ou envia formato inválido | Gestor contrato EMIS/Unitel da escola |

**SLA sugerido:** L1 resolve no mesmo dia útil (confirmação manual). L2–L3 em 1–2 dias úteis com dados completos da tabela acima.

## Observabilidade

Cada chamada ao webhook (sucesso ou falha) fica registada na tabela `finance_gateway_webhook_events` e em log JSON (`tag: gateway-webhook`). A tesouraria vê os **últimos 5 eventos** em Definições → Integrações (Multicaixa / Unitel).

### Operador plataforma

Painel ADMIN → **Webhooks gateway** (`/gateway-webhooks`): totais 24h/7d, falhas recentes cross-tenant, escolas com mais falhas na semana.

```sh
# Últimos 20 eventos (todas as escolas)
npm run siga:gateway-events-recent

# Só falhas
npm run siga:gateway-events-recent -- --failures-only

# Limite customizado
npm run siga:gateway-events-recent -- --limit=50
```

Requer `SUPABASE_URL` + `SUPABASE_SECRET_KEY` no `.env`. Se a tabela não existir, executar `npm run siga:sql` → `APPLY_IN_SQL_EDITOR.sql`.

### Alertas Slack (opcional)

Defina `SIGA_GATEWAY_ALERT_SLACK_URL` (Incoming Webhook) no ambiente de produção do SIGA. Falhas com HTTP ≥ 400 disparam uma mensagem compacta (canal, escola, referência mascarada, mensagem).

### Alerta de taxa de falha 24h (plataforma)

Quando a taxa de falha nas últimas 24h excede **25%** (mínimo **5** eventos), o SIGA pode alertar a equipa de plataforma:

| Variável | Defeito | Descrição |
| --- | --- | --- |
| `SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL` | fallback `SIGA_GATEWAY_ALERT_SLACK_URL` | Slack Incoming Webhook |
| `SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_TO` | — | Destinatários (Resend) |
| `SIGA_GATEWAY_FAILURE_RATE_THRESHOLD` | `0.25` | Limiar 0–1 |
| `SIGA_GATEWAY_FAILURE_RATE_MIN_EVENTS` | `5` | Mínimo de eventos antes de alertar |
| `SIGA_GATEWAY_FAILURE_RATE_COOLDOWN_HOURS` | `6` | Evita spam (registo em `saas_audit_logs`) |

- **Automático:** após cada falha de webhook, o servidor verifica a taxa (se alertas configurados).
- **Cron:** `npm run siga:gateway-failure-rate-check` (sugerido de hora a hora).
- **GitHub Actions:** workflow `gateway-failure-rate-check.yml` (mesmos secrets, skip se Supabase em falta).

Modelo para pedir credenciais ao banco: [Pedido ao banco EMIS/Unitel](/integracoes/gateway-portal-banco).

### Logs estruturados

Procurar no stdout do servidor:

```json
{"tag":"gateway-webhook","ok":false,"status":401,"channel":"multicaixa_express",…}
```

Referências são mascaradas nos logs e na BD (últimos 4 dígitos). A API key **nunca** é persistida.

## Verificação pós-correcção

- [ ] Simulador ou webhook de teste → HTTP `200`, `planSettled: true`
- [ ] Fatura de teste nova → pagamento real ou simulado → `paid`
- [ ] Recibo visível na tesouraria
- [ ] Escola documentou URL + API key no portal banco

## Prevenção

- Seguir [Checklist de produção](/integracoes/gateway-producao) antes do go-live.
- Não partilhar API keys entre escolas.
- Após mudança de hostname (domínio custom), actualizar URL no portal banco.
- CI nocturno `@live` alerta regressões (`gateway-live.spec.ts`).

## Ver também

- [EMIS / Multicaixa e Unitel — referência](/integracoes/emis-multicaixa-unitel)
- [Checklist produção](/integracoes/gateway-producao)
- [Onboarding pós-criação](/web/onboarding-pos-criacao)
