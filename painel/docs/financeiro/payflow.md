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
5. **Extrato CSV** — no `/admin` do PayFlow (aba Transferências): descarregar modelo, importar, pré-visualizar e marcar «Conciliar correspondências» para liquidar.
6. **API bancária** — conector externo chama `POST /api/v1/bank-movements/ingest` com a chave de integração, `school_id` e o movimento (referência PF-TF-…, valor em cêntimos, `bank_transaction_id`).
   Simulação local: `npm run siga:payflow-bank-ingest -- --school-id=… --transfer-reference=PF-TF-… --amount-minor=1500000`.

Opcional: `PAYFLOW_AUTO_SYNC=1` no `.env` do SIGA sincroniza o aluno no PayFlow após cada emissão de fatura (background, não bloqueia).
5. **Extrato** — no PayFlow Admin → Transferências → importar CSV (pré-visualização; opcionalmente conciliar correspondências exactas).

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
| `PAYFLOW_RUNTIME_MODE` | `production` por omissão; `sandbox` só em local |
| `PAYFLOW_AUTO_SYNC` | `1` = após emitir fatura, sync aluno no PayFlow em background (opt-in) |

Propagação: `npm run siga:sync-env`.

## Segurança operacional

- Confirmação de pagamento **nunca** por redirect do browser.
- Comprovativo do pagador **não** liquida a fatura sozinho.
- Revisão manual no painel exige papel `finance_admin` (Administrador SIGA via SSO) + comprovativo já submetido.
- Login por chave no `/admin` do PayFlow fica reservado a **sandbox**.
- Isolamento: a conciliação e o extrato só vêem a escola da sessão; o sync recusa IDs que já pertençam a outra escola.
- Estorno: no painel admin, **Estornar** (só Administrador via SSO). O recibo original fica; corrija o caixa no SIGA.
- Logs JSON `app=payflow` (sem IBAN nem nomes).

## Checklist antes de produção

- [ ] IBAN real sincronizado por escola
- [ ] `PAYFLOW_SSO_SECRET` e `PAYFLOW_INTEGRATION_API_KEY` configurados
- [x] Fonte de movimentos (extrato CSV no PayFlow Admin; API bancária ainda não)
- [ ] Homologação EMIS/Unitel no portal externo (se aplicável)
- [x] Teste de isolamento entre duas escolas (unitário no PayFlow; validar com dois tenants reais antes de tráfego)

## Ajuda relacionada

- [Exportação SAFT-AO / AGT](./saft-agt-exportacao)
- [EMIS / Multicaixa e Unitel](/integracoes/emis-multicaixa-unitel)
- [Checklist produção gateway](/integracoes/gateway-producao)
- [SQL SGA](/guide/sql-sga)
