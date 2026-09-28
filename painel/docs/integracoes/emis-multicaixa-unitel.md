# EMIS / Multicaixa Express e Unitel Money

Guia para tesourarias e equipas técnicas configurarem pagamentos automáticos de propinas no SIGA Plus.

## Visão geral

```text
Fatura emitida → plano pending_gateway (referência EMIS)
  → pagador paga no terminal / app
  → gateway externo POST webhook → SIGA
  → register_payment + plano settled
  → alternativa: confirmar manualmente (PaymentReferenceCard)
```

O SIGA gera referências **determinísticas** (mesma fatura → mesma referência). A confirmação automática depende do webhook configurado no portal EMIS ou Unitel.

## Onde configurar no SIGA

1. Entrar como administrador escolar.
2. **Definições → Integrações**.
3. Instalar **Multicaixa Express** e/ou **Unitel Money**.
4. Copiar a **API key de webhook** gerada na instalação.
5. Para Multicaixa: preencher **Merchant EMIS / Multicaixa** (4–6 dígitos).

A secção «Webhook de confirmação» na integração mostra URL e API key prontos a copiar.

## Entidade EMIS por escola

Cada escola deve usar a **entidade EMIS** atribuída pelo banco/EMIS — não o valor de demonstração partilhado.

| Campo na UI | Campo no config | Regra |
| --- | --- | --- |
| Merchant EMIS / Multicaixa | `merchantId` ou `emisEntity` | 4–6 dígitos |
| (vazio) | — | não há referências Multicaixa até a entidade ser preenchida |

A entidade entra nas referências Multicaixa geradas em `/faturas` e no `PaymentReferenceCard`. O webhook valida montante e referência contra o plano `pending_gateway` da escola.

## Webhook EMIS / Multicaixa Express

| Item | Valor |
| --- | --- |
| Método | `POST` |
| URL | `https://{hostname-siga}/api/finance/gateway/confirm` |
| Content-Type | `application/json` |
| Autenticação | campo `apiKey` no corpo (valor de Integrações) |

Corpo JSON:

```json
{
  "apiKey": "<webhookApiKey da escola>",
  "reference": "123456789",
  "amount": 45000,
  "invoiceId": "<uuid opcional>"
}
```

- `reference` — 9 dígitos, sem espaços.
- `amount` — valor em **kwanzas inteiros** (ex. `45000` = 45 000 Kz).
- `invoiceId` — opcional; acelera o match se vários planos estiverem abertos.

Resposta esperada: `200` com `{ "ok": true }` quando o pagamento for registado.

## Webhook Unitel Money

Unitel usa **URL dedicada** (canal fixo `unitel_money`):

| Item | Valor |
| --- | --- |
| Método | `POST` |
| URL | `https://{hostname-siga}/api/finance/gateway/unitel/confirm` |
| Corpo | igual ao EMIS (`apiKey`, `reference`, `amount`, `invoiceId?`) |

Configure esta URL no portal Unitel Money, não a rota Multicaixa genérica.

## Hostname do SIGA

Em produção use o hostname público da escola (subdomínio `portal-siga.com` ou domínio custom activo). Exemplos:

- `https://colegioesperanca.portal-siga.com/api/finance/gateway/confirm`
- `https://pagamentos.escola.ao/api/finance/gateway/unitel/confirm`

O hostname deve ser o mesmo que os encarregados usam para aceder ao SIGA — o webhook corre na mesma instância multi-tenant.

## Teste local (desenvolvimento)

```sh
# .env — chave dev partilhada (simulador)
SIGA_GATEWAY_DEV_API_KEY=dev-gateway-key-local

npm run siga:gateway-simulate -- --invoice-id=<uuid-fatura> [--amount=45000]
npm run siga:gateway-simulate -- --invoice-id=<uuid-fatura> --unitel
```

Com integração instalada na escola, use a **API key real** copiada da UI em vez da chave dev.

### Verificação @live (CI)

Com Supabase configurado, `npm run siga:e2e-playwright-live` inclui `gateway-live.spec.ts`:

1. Modo dev — `SIGA_GATEWAY_DEV_API_KEY` + `invoiceId` no corpo
2. Modo escola EMIS — `webhookApiKey` em Integrações → Multicaixa Express
3. Modo Unitel — `POST /api/finance/gateway/unitel/confirm` (dev key ou `webhookApiKey` Unitel)

Provisionamento → fatura → webhook → liquidada.

```sh
SIGA_E2E_LIVE=1 npm run siga:e2e-playwright-live
```

## Resolução de problemas

| Sintoma | Verificar |
| --- | --- |
| `401` / API key inválida | `webhookApiKey` em Integrações; não confundir com `merchantId` |
| Referência não encontrada | Plano em `pending_gateway`; referência igual à da fatura |
| Montante rejeitado | `amount` em kwanzas inteiros, igual ao plano |
| Unitel não liquida | URL `/unitel/confirm`, não `/gateway/confirm` |
| Entidade errada no terminal | Campo Merchant EMIS na integração Multicaixa |

## Observabilidade

| Onde | O quê |
| --- | --- |
| SIGA → Integrações | Últimos 5 webhooks por canal |
| ADMIN → Webhooks gateway | Métricas 24h/7d cross-tenant |
| CLI | `npm run siga:gateway-events-recent` |
| Alertas | `SIGA_GATEWAY_ALERT_SLACK_URL`, `SIGA_GATEWAY_FAILURE_RATE_*` |

Detalhes: [Runbook observabilidade](/integracoes/gateway-runbook-suporte#observabilidade).

## Rotação de API key

Se a `webhookApiKey` foi exposta ou o contrato com o banco mudou:

1. Definições → Integrações → secção webhook → **Rotacionar key**
2. Copiar a **nova** key para o portal EMIS/Unitel
3. Durante **24 h** a key anterior continua válida (período de graça)
4. Confirmar webhook de teste → HTTP `200`

Ver [Checklist produção § Segurança](/integracoes/gateway-producao#segurança).

## Ver também

- [Pedido ao banco — portal EMIS/Unitel](/integracoes/gateway-portal-banco)
- [Checklist de produção (EMIS/Unitel)](/integracoes/gateway-producao)
- [Runbook — falha de webhook](/integracoes/gateway-runbook-suporte)
- [Fluxos e provisionamento — Gateway](/arquitetura/fluxos#gateway-multicaixa-unitel)
- [Onboarding pós-criação](/web/onboarding-pos-criacao) — propinas após criar escola
