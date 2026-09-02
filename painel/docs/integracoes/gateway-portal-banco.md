# Pedido ao banco — EMIS / Unitel (portal externo)

Modelo para a **escola** ou **operador SIGA Plus** solicitar credenciais e configurar o callback no portal EMIS/Multicaixa ou Unitel Money.

> O SIGA **não** emite merchant ID, entidade EMIS nem contratos bancários. Este documento lista o que pedir ao banco e o que colar no portal externo a partir do SIGA.

## O que a escola obtém no banco

| Credencial | Quem emite | Onde entra no SIGA |
| --- | --- | --- |
| Entidade EMIS (4–6 dígitos) | Banco / EMIS | Definições → Integrações → **Merchant EMIS / Multicaixa** |
| Conta merchant Unitel | Unitel Money | Contrato comercial (sem campo directo no SIGA além da integração) |
| URL de notificação | **Copiada do SIGA** | Portal banco (não inventar) |
| API key de webhook | **Gerada pelo SIGA** na instalação da integração | Portal banco — campo `apiKey` no JSON |

**Não confundir:** entidade EMIS ≠ API key. A entidade aparece no terminal; a API key autentica o POST de confirmação.

## Dados a copiar do SIGA (antes de falar com o banco)

1. Hostname público da escola (ex. `colegio.portal-siga.com`).
2. Definições → Integrações → instalar Multicaixa e/ou Unitel.
3. Copiar da secção «Webhook de confirmação»:

| Canal | URL |
| --- | --- |
| EMIS / Multicaixa | `https://{hostname}/api/finance/gateway/confirm` |
| Unitel Money | `https://{hostname}/api/finance/gateway/unitel/confirm` |

4. Copiar **API key** (`webhookApiKey`) — uma por canal, por escola.
5. Anotar **Merchant EMIS** (Multicaixa) — valor que o banco vai confirmar ou atribuir.

## Modelo de pedido (e-mail / ticket ao banco)

```text
Assunto: Configuração de notificação de pagamento — [Nome da escola]

Exmos. Senhores,

Solicitamos a activação/configuração do serviço de referência Multicaixa
(EMIS) para a instituição [Nome], NIF [NIF].

Dados para callback automático (liquidação de propinas):

  URL de notificação (POST, JSON):
    https://[hostname]/api/finance/gateway/confirm

  Autenticação: campo "apiKey" no corpo JSON (valor que forneceremos
  após confirmação da entidade EMIS).

  Corpo esperado:
    { "apiKey": "…", "reference": "123456789", "amount": 45000, "invoiceId": "…" }

  Entidade EMIS atribuída à escola: [4–6 dígitos — confirmar com o banco]

  Montante: kwanzas inteiros (ex. 45000 = 45 000 Kz)
  Referência: 9 dígitos, sem espaços

Pedimos confirmação por escrito da entidade EMIS e teste de webhook
de sandbox/staging antes do go-live.

Com os melhores cumprimentos,
[Nome] — [Cargo] — [Contacto]
```

Para **Unitel Money**, substituir a URL por:

```text
https://[hostname]/api/finance/gateway/unitel/confirm
```

e mencionar integração **Unitel Money** (API key separada da Multicaixa).

## Checklist portal banco (pós-resposta)

- [ ] Entidade EMIS confirmada = valor no SIGA (Integrações → Merchant EMIS)
- [ ] URL exacta no portal (HTTPS, hostname público activo)
- [ ] Método POST, Content-Type `application/json`
- [ ] Campo de autenticação = `apiKey` (valor do SIGA, **não** entidade EMIS)
- [ ] Teste sandbox ou pagamento mínimo → fatura SIGA passa a `paid`
- [ ] Unitel: URL `/unitel/confirm`, integração Unitel instalada no SIGA

## Se o banco pedir IP fixo ou mTLS

O SIGA Plus em cloud usa hostname TLS padrão. Se o banco exigir lista de IPs ou certificado cliente, escalar ao **operador plataforma** (ADMIN `/domains`, infra Hostinger/Cloudflare) — não configurável pela escola no SIGA.

## Após go-live

- Monitorizar: ADMIN → **Webhooks gateway** ou tesouraria → Integrações (últimos webhooks).
- Runbook de incidentes: [Falha de webhook](/integracoes/gateway-runbook-suporte).
- Alertas opcionais: [Checklist produção § Fase 6](/integracoes/gateway-producao#fase-6--observabilidade-pós-go-live).

## Ver também

- [Checklist de produção](/integracoes/gateway-producao)
- [Referência técnica EMIS/Unitel](/integracoes/emis-multicaixa-unitel)
- [Runbook suporte](/integracoes/gateway-runbook-suporte)
