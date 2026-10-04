# Checklist de produção — EMIS e Unitel

Guia para **operadores SIGA Plus** e **administradores escolares** activarem pagamentos automáticos com credenciais reais nos portais EMIS/Multicaixa e Unitel Money.

> O SIGA não emite credenciais bancárias. A escola obtém merchant/entidade junto do banco ou operador; o SIGA recebe o webhook e liquida a fatura.

## Papéis

| Papel                 | Responsabilidade                                      |
| --------------------- | ----------------------------------------------------- |
| Operador plataforma   | Hostname público activo, TLS, escola visível no ADMIN |
| Administrador escolar | Integrações, entidade EMIS, teste de fatura           |
| Tesouraria / banco    | Contrato EMIS, URL de callback no portal externo      |

## Fase 1 — Pré-requisitos SIGA

- [ ] Escola provisionada (WEB `/start` ou ADMIN) com subscrição activa
- [ ] Hostname público acessível (ex. `escola.portal-siga.com` ou domínio custom activo em ADMIN `/domains`)
- [ ] Plano financeiro activo (bootstrap ou Definições → Financeiro)
- [ ] Pelo menos uma fatura de teste emitida em `/faturas` (estado `open`)

## Fase 2 — Configurar no SIGA

1. **Definições → Integrações**
2. Instalar **Multicaixa Express** e/ou **Unitel Money**
3. Copiar da secção «Webhook de confirmação»:
   - URL (EMIS ou Unitel — são diferentes)
   - **API key** (`webhookApiKey`)
4. **Multicaixa:** preencher **Merchant EMIS / Multicaixa** (4–6 dígitos) — valor atribuído pelo banco, **não** `99824` (demo)
5. Guardar integração com estado `connected` ou `configured`

| Canal             | URL de callback (substituir hostname)                   |
| ----------------- | ------------------------------------------------------- |
| EMIS / Multicaixa | `https://{hostname}/api/finance/gateway/confirm`        |
| Unitel Money      | `https://{hostname}/api/finance/gateway/unitel/confirm` |

Corpo JSON que o portal externo deve enviar:

```json
{
  "reference": "123456789",
  "amount": 45000,
  "externalId": "<id da transacção no provedor>"
}
```

A key copiada do SIGA **não** vai no corpo: assina o pedido (`X-SIGA-Timestamp`,
`X-SIGA-Signature`). Ver [EMIS / Unitel](./emis-multicaixa-unitel.md).

## Fase 3 — Portal EMIS / Multicaixa (externo)

Passos típicos no portal do banco/EMIS (nomes variam por instituição):

- [ ] Contrato merchant activo para a escola
- [ ] Entidade EMIS registada — **mesmo valor** que no SIGA (Integrações → Merchant EMIS)
- [ ] URL de notificação = `https://{hostname}/api/finance/gateway/confirm`
- [ ] Método `POST`, corpo JSON
- [ ] Pedido assinado com a key do SIGA (`X-SIGA-Timestamp` + `X-SIGA-Signature`), não o merchant ID
- [ ] Montante em kwanzas inteiros, referência de 9 dígitos sem espaços

## Fase 4 — Portal Unitel Money (externo)

- [ ] Conta merchant Unitel activa
- [ ] URL de callback = `https://{hostname}/api/finance/gateway/unitel/confirm` (**não** a rota Multicaixa)
- [ ] Mesmo corpo JSON (`reference`, `amount`, `externalId`) e mesma assinatura
- [ ] API key = valor de Integrações → **Unitel Money** (integração separada da Multicaixa)

## Fase 5 — Go-live (validação)

### 5.1 Referência visível

- [ ] Em `/faturas`, abrir fatura de teste → **Referência EMIS** / `PaymentReferenceCard` mostra entidade + referência
- [ ] Plano em estado `pending_gateway` (tesouraria ou emissão com canal gateway)

### 5.2 Simulador (ambiente de staging / dev)

Com SIGA a correr e `.env` com `SIGA_GATEWAY_DEV_API_KEY`:

```sh
# EMIS
npm run siga:gateway-simulate -- --invoice-id=<uuid> [--amount=45000]

# Unitel (mesma fatura, URL dedicada)
npm run siga:gateway-simulate -- --invoice-id=<uuid> --unitel
```

Resposta esperada: HTTP `200`, `{ "ok": true, "planSettled": true }`.

### 5.3 Pagamento real (produção)

- [ ] Pagamento no terminal/app com a referência exacta da fatura
- [ ] Webhook recebido pelo SIGA (ver logs do servidor ou estado da fatura → `paid`)
- [ ] Recibo gerado; plano `settled`
- [ ] Se falhar: confirmar manualmente via `PaymentReferenceCard` na fatura (fallback)

### 5.4 CI @live (equipa SIGA Plus)

Com Supabase de staging:

```sh
SIGA_E2E_LIVE=1 npm run siga:e2e-playwright-live
```

Inclui `gateway-live.spec.ts` — EMIS + Unitel, dev key e webhook por escola.

## Fase 6 — Observabilidade pós-go-live

- [ ] Tabela `finance_gateway_webhook_events` aplicada (`npm run siga:sql`)
- [ ] Tesouraria vê últimos webhooks em Definições → Integrações
- [ ] Operador: ADMIN → **Webhooks gateway** (`/gateway-webhooks`)
- [ ] CLI: `npm run siga:gateway-events-recent -- --failures-only`
- [ ] Alertas opcionais no `.env`:
  - `SIGA_GATEWAY_ALERT_SLACK_URL` — cada falha HTTP ≥ 400
  - `SIGA_GATEWAY_FAILURE_RATE_*` — taxa 24h elevada (Slack/Resend)
- [ ] Cron sugerido: `npm run siga:gateway-failure-rate-check` (horário)
- [ ] GitHub Actions nocturno: workflow `gateway-failure-rate-check.yml` (secrets opcionais)

Ver [Runbook § Observabilidade](/integracoes/gateway-runbook-suporte#observabilidade) e [Pedido ao banco](/integracoes/gateway-portal-banco).

## Erros frequentes em produção

| Sintoma                   | Causa provável                                                  | Acção                                                       |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `401` API key inválida    | Merchant ID colado no portal em vez de `webhookApiKey`          | Copiar API key de Integrações                               |
| Referência não encontrada | Plano não está `pending_gateway` ou referência diferente        | Reemitir referência; comparar 9 dígitos                     |
| Unitel não liquida        | URL `/gateway/confirm` em vez de `/unitel/confirm`              | Corrigir no portal Unitel                                   |
| Entidade errada no ATM    | Referência antiga gerada com a entidade de demonstração `99824` | Preencher a entidade real da escola e gerar nova referência |
| Webhook OK mas sem recibo | Permissões SGA / RPC `register_payment`                         | Aplicar SQL SGA; confirmar manualmente na tesouraria        |

## Segurança

- Não partilhar `webhookApiKey` entre escolas (multi-tenant)
- Rotacionar API key se exposta — Definições → Integrações → **Rotacionar key** (Multicaixa/Unitel)
- A rotação gera key nova e mantém a anterior **24 horas** (período de graça) — actualize o portal banco nesse intervalo
- Usar sempre HTTPS no hostname público
- Não commitar `.env` nem chaves no repositório

## Ver também

- [Pedido ao banco (modelo EMIS/Unitel)](/integracoes/gateway-portal-banco)
- [EMIS / Multicaixa e Unitel — referência técnica](/integracoes/emis-multicaixa-unitel)
- [Runbook — falha de webhook](/integracoes/gateway-runbook-suporte)
- [Onboarding pós-criação](/web/onboarding-pos-criacao)
- [Fluxos — Gateway](/arquitetura/fluxos#gateway-multicaixa-unitel)
