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

## Segredos no servidor (nunca no browser)

| Variável | Uso |
| --- | --- |
| `VITE_PAYFLOW_URL` | URL pública do PayFlow |
| `PAYFLOW_INTEGRATION_API_KEY` | Sync servidor→servidor (≥24 chars) |
| `PAYFLOW_SSO_SECRET` | JWT SSO admin (≥32 chars), igual no SIGA e no PayFlow |
| `PAYFLOW_RUNTIME_MODE` | `production` por omissão; `sandbox` só em local |

Propagação: `npm run siga:sync-env`.

## Segurança operacional

- Confirmação de pagamento **nunca** por redirect do browser.
- Comprovativo do pagador **não** liquida a fatura sozinho.
- Revisão manual no painel exige papel `finance_admin` (Administrador SIGA via SSO) + comprovativo já submetido.
- Login por chave no `/admin` do PayFlow fica reservado a **sandbox**.

## Checklist antes de produção

- [ ] IBAN real sincronizado por escola
- [ ] `PAYFLOW_SSO_SECRET` e `PAYFLOW_INTEGRATION_API_KEY` configurados
- [ ] Fonte de movimentos (API bancária ou extrato) definida
- [ ] Homologação EMIS/Unitel no portal externo (se aplicável)
- [ ] Teste de isolamento entre duas escolas

## Ajuda relacionada

- [Exportação SAFT-AO / AGT](./saft-agt-exportacao)
- [EMIS / Multicaixa e Unitel](/integracoes/emis-multicaixa-unitel)
- [Checklist produção gateway](/integracoes/gateway-producao)
- [SQL SGA](/guide/sql-sga)
