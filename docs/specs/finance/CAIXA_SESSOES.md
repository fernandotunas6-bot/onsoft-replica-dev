# Sessões de caixa — proposta

**Data:** 24/10/2026. **Estado:** implementado no #283, com as decisões abaixo respondidas (um posto por escola; 30 dias de aviso; aprovação de qualquer diferença; estorno na sessão aberta). A migração `20261024110000` está por aplicar. Pendência 3 de [`FINANCE_MASTER_2026.md`](FINANCE_MASTER_2026.md).

## Problema

Hoje o caixa não tem sessão. As entradas são os recibos (`finance_receipts`) e as saídas são `siga_cash_expenses`. Nenhuma das duas sabe em que posto, turno ou gaveta o dinheiro entrou. Por isso:

- não há abertura com fundo de maneio nem fecho com contagem;
- uma diferença de caixa não tem onde ser registada, nem quem a justifique;
- o saldo em numerário (`drawer_balance`, desde o #276) é o da escola inteira e desde sempre, não o da gaveta de hoje.

## Modelo proposto

### `finance_cash_points` — postos de atendimento

| Coluna      | Tipo    | Notas                                                   |
| ----------- | ------- | ------------------------------------------------------- |
| `id`        | uuid    |                                                         |
| `school_id` | uuid    | FK `schools`                                            |
| `name`      | text    | «Secretaria», «Balcão 2»                                |
| `active`    | boolean | Um posto desactivado não abre sessões; o histórico fica |

Único `(school_id, name)`.

### `finance_cash_sessions` — uma por abertura

| Coluna                        | Tipo               | Notas                                                                            |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| `id`                          | uuid               |                                                                                  |
| `school_id`                   | uuid               |                                                                                  |
| `cash_point_id`               | uuid               | FK `finance_cash_points`                                                         |
| `opened_by` / `opened_at`     | uuid / timestamptz |                                                                                  |
| `opening_float`               | numeric(18,2)      | Fundo de maneio contado à abertura                                               |
| `status`                      | text               | `open` → `closing` → `closed`; `closed` → `reopened` só com aprovação            |
| `closed_by` / `closed_at`     | uuid / timestamptz |                                                                                  |
| `counted_cash`                | numeric(18,2)      | Contagem física no fecho                                                         |
| `expected_cash`               | numeric(18,2)      | Calculado pela base no fecho: fundo + recibos `cash` − despesas `cash` da sessão |
| `difference`                  | numeric(18,2)      | `counted_cash − expected_cash`, gravado, nunca editado                           |
| `difference_reason`           | text               | Obrigatório quando `difference ≠ 0`                                              |
| `approved_by` / `approved_at` | uuid / timestamptz | Aprovação da diferença ou da reabertura                                          |

Índice único parcial: **uma sessão `open` por posto** (`WHERE status = 'open'`).

### Ligação aos movimentos

`finance_receipts.cash_session_id` e `siga_cash_expenses.cash_session_id`: uuid, nulos nos registos anteriores e em tudo o que não é numerário (gateway, transferência, cartão). `register_payment` e o registo de despesa preenchem a coluna quando o método é `cash`, e **recusam numerário sem sessão aberta** no posto do operador. Esta recusa é a mudança de comportamento visível: hoje qualquer pessoa da tesouraria regista numerário a qualquer hora.

Uma despesa «Por aprovar» (acima de 50 000 Kz, #295) não entra na sessão ao ser registada: o numerário só sai da gaveta quando é aprovada, e entra então na sessão aberta (ou é recusada se não houver). Anulada antes de aprovar, não conta em sessão nenhuma.

**Depósito da gaveta no banco** (decidido a 25/10/2026): `finance_cash_deposits`. O numerário levado ao banco sai do esperado da sessão aberta, com o nº do talão (o mesmo talão não entra duas vezes), e não pode ser maior do que o que há na gaveta. Fica por confirmar até alguém que não o registou o ver no extracto. Anula-se, com motivo, só com o caixa ainda aberto e antes de confirmado. Funções `record_cash_deposit`, `reverse_cash_deposit` e `confirm_cash_deposit`; na Tesouraria, «Depósitos por confirmar»; no relatório dos fechos, a coluna «Depósitos».

## Funções (RPC, `private` com invólucro em `public`)

| Função                                         | Faz                                                                                           | Quem                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| `open_cash_session(point, float)`              | Abre; falha se o posto já tiver sessão aberta                                                 | Tesouraria, Administrador; AAL2        |
| `close_cash_session(session, counted, reason)` | Tranca a sessão `FOR UPDATE`, calcula `expected_cash`, grava a diferença; exige motivo se ≠ 0 | Quem abriu, ou Administrador           |
| `approve_cash_difference(session)`             | Aprova a diferença                                                                            | Administrador, **e nunca quem fechou** |
| `reopen_cash_session(session, reason)`         | `closed` → `reopened`, com motivo; o fecho anterior fica no histórico                         | Administrador                          |

Todas com `search_path = ''`, `SECURITY DEFINER`, `has_permission` e AAL2, como `register_payment`, e com `REVOKE … FROM PUBLIC, anon` na mesma migração.

## Ecrã

Em **Movimentos de Caixa** (`/financeiro`), no topo, um só bloco de estado:

- sem sessão: «Caixa fechado» e o botão **Abrir caixa** (posto e fundo de maneio);
- com sessão: posto, operador, hora de abertura, numerário esperado agora, e **Fechar caixa** (contagem, diferença calculada à vista, motivo quando ≠ 0);
- o relatório de fecho imprime-se no modelo `service-document` já usado nos recibos.

Os fechos com diferença por aprovar aparecem na Tesouraria, que é a visão geral. Não se cria página nova.

## Testes de aceitação

1. Duas aberturas simultâneas no mesmo posto: uma passa, a outra recebe erro.
2. Recibo em numerário sem sessão aberta: recusado; por transferência: aceite.
3. Fecho com contagem igual ao esperado: diferença 0, sem motivo.
4. Fecho com diferença sem motivo: recusado.
5. Quem fechou tenta aprovar a própria diferença: recusado.
6. Um estorno de recibo `cash` depois do fecho não altera o `expected_cash` gravado; aparece na sessão em que foi feito.
7. Outra escola não vê nem fecha a sessão (RLS e `school_id`).

## Decisões pedidas

1. **Postos:** cada escola define os seus, ou basta um posto por escola nesta primeira versão?
2. **Numerário sem sessão:** recusar logo, ou avisar durante um período de transição?
3. **Aprovação da diferença:** qualquer diferença, ou só acima de um limite (qual)?
4. **Estorno depois do fecho:** fica na sessão aberta no momento do estorno (proposta acima), ou reabre a sessão original?

Com estas respostas, a migração e o ecrã fazem-se num PR próprio, com a migração por aplicar até aprovação.
