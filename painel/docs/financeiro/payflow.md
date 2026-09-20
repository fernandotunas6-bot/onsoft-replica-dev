# PayFlow — cobrança e conciliação

O **PayFlow** (`painel/payflow`, porta local `3007`) cobra propinas e serviços.
O **SIGA** continua a ser a fonte de verdade académica e da obrigação financeira.
O **ADMIN/WEB** trata do billing SaaS (assinatura da escola) — não confundir com propina.

Referência técnica no repositório: `docs/agents/PAYFLOW_INTEGRATION.md`.

## O que fazer na escola

1. **IBAN** — Definições → Financeiro → preencher titular, banco e IBAN AO.
2. **Sync IBAN → PayFlow** — no mesmo painel (também corre após «Guardar banco»).
3. **Aluno** — na ficha ou no modal extensivo → **Sync PayFlow** (matrícula activa + faturas).
4. **Conciliação** — em `/financeiro` ou `/faturas` → **Conciliação PayFlow** (SSO assinado).
5. **Extrato CSV** — no `/admin` do PayFlow (aba Transferências): modelo CSV → importar → pré-visualizar → «Conciliar correspondências».
6. **API bancária** — ingest, **Puxar movimentos** no admin, ou `npm run siga:payflow-bank-pull -- --school-id=…`.
   Em sandbox: `PAYFLOW_BANK_CONNECTOR_URL=http://localhost:3007/api/v1/bank-movements/sandbox-feed?transfer_reference=…&amount=…`.
   Simulação ingest: `npm run siga:payflow-bank-ingest -- --school-id=… --transfer-reference=PF-TF-… --amount-minor=1500000`.
7. **Alertas** — opcional: `PAYFLOW_ALERT_WEBHOOK_URL` (Sentry/pager). Sem URL, só logs JSON.
8. **Acerto SIGA** — liquidação/estorno no PayFlow notifica `POST /api/finance/payflow/settlement` (mesma chave de integração).

Opcional: `PAYFLOW_AUTO_SYNC=1` no `.env` do SIGA sincroniza o aluno no PayFlow após cada emissão de fatura (background, não bloqueia).

Modelo CSV (`;` ou `,`):

```csv
data;referencia;valor;moeda;movimento;descricao
05/09/2026;PF-TF-20260905-ABC123DEAD;15.000,00;AOA;MOV-001;Propina
```

`valor` é em AOA (vírgula decimal). Use `valor_centimos` se o banco exportar cêntimos. Linhas com valor ou referência diferentes **não** são liquidadas.

## Segredos no servidor (nunca no browser)

| Variável | Uso |
| --- | --- |
| `VITE_PAYFLOW_URL` | URL pública do PayFlow |
| `PAYFLOW_INTEGRATION_API_KEY` | Sync servidor→servidor (≥24 chars) |
| `PAYFLOW_SSO_SECRET` | JWT SSO admin (≥32 chars), igual no SIGA e no PayFlow |
| `PAYFLOW_SIGA_URL` | Origem do SIGA para acerto de caixa |
| `PAYFLOW_RUNTIME_MODE` | `production` por omissão; `sandbox` só em local |
| `PAYFLOW_AUTO_SYNC` | `1` = após emitir fatura, sync aluno no PayFlow em background (opt-in) |
| `PAYFLOW_ALERT_WEBHOOK_URL` | Webhook HTTPS para rejeições/estornos/falhas de acerto SIGA |
| `PAYFLOW_BANK_CONNECTOR_URL` | Endpoint do banco para o pull (HTTPS; nunca no pedido) |
| `PAYFLOW_BANK_CONNECTOR_KEY` | Bearer do conector (≥16 chars) |
| `PAYFLOW_EMIS_HOMOLOGATED` | `1` só após contrato EMIS — **não** activa o adaptador de produção sozinho |

Propagação: `npm run siga:sync-env`.

## Segurança operacional

- Confirmação de pagamento **nunca** por redirect do browser.
- Comprovativo do pagador **não** liquida a fatura sozinho.
- Revisão manual no painel exige papel `finance_admin` (Administrador SIGA via SSO) + comprovativo já submetido.
- Login por chave no `/admin` do PayFlow fica reservado a **sandbox** (UI esconde o formulário em produção; API também fail-closed).
- Isolamento: a conciliação e o extrato só vêem a escola da sessão; o sync recusa IDs que já pertençam a outra escola.
- Estorno: no painel admin, **Estornar** (só Administrador via SSO). O recibo PayFlow original fica; o SIGA anula o recibo de caixa via webhook de acerto.
- Logs JSON `app=payflow` (sem IBAN nem nomes). Falha de acerto SIGA dispara alerta se o webhook estiver configurado.
- Estado operacional: aba **Canais & Infraestrutura** ou `GET /api/v1/health`.

## Checklist EMIS (antes de Multicaixa real)

1. Contrato + credenciais (`EMIS_BASE_URL`, `EMIS_API_KEY`, `EMIS_WEBHOOK_SECRET`, merchant/terminal).
2. Homologação no portal EMIS com referências de teste.
3. Só então `PAYFLOW_EMIS_HOMOLOGATED=1` — o adaptador de produção **continua fechado** até existir implementação dedicada; o flag só marca prontidão no health.
4. Ingress `POST /api/v1/webhooks/emis` valida HMAC (`X-Emis-Signature: sha256=<hex>`) e responde `501 emis_adapter_not_ready` — **não liquida**.
5. Manter transferências IBAN como canal principal até o adaptador EMIS estar ligado.

## Checklist antes de produção

- [ ] IBAN real sincronizado por escola
- [ ] `PAYFLOW_SSO_SECRET`, `PAYFLOW_INTEGRATION_API_KEY` e `PAYFLOW_SIGA_URL` configurados
- [x] Fonte de movimentos (CSV, ingest e pull fail-closed; falta o URL real do banco)
- [x] Acerto caixa SIGA (`/api/finance/payflow/settlement`)
- [ ] Homologação EMIS/Unitel no portal externo (se aplicável)
- [x] Teste de isolamento entre duas escolas (unitário no PayFlow; validar com dois tenants reais antes de tráfego)
- [ ] `PAYFLOW_ALERT_WEBHOOK_URL` em staging/produção

## Ajuda relacionada

- [Exportação SAFT-AO / AGT](./saft-agt-exportacao)
- [EMIS / Multicaixa e Unitel](/integracoes/emis-multicaixa-unitel)
- [Checklist produção gateway](/integracoes/gateway-producao)
- [SQL SGA](/guide/sql-sga)
