# Evolução SIGA Plus — 7–8 de Outubro de 2026

Pedido: corrigir, completar e especificar o sistema, seguindo o banco actual existente.
Base: branch `docs/auditoria-critica-2026-10-06`, commit `df5009b39f03b69acc2cc69db235682bfd994e15`.
As quatro alterações locais pré-existentes e a auditoria anterior são preservadas.

## Concluído na inspecção

- Inventário e matriz histórica em `docs/auditoria/2026-10-07/`; não reescrever a evidência anterior.
- Arquitectura, handoff, regras SQL e skills dos módulos afectados lidos.
- Snapshot de 189 tabelas e catálogo real conferidos; nenhuma tabela/coluna nova planeada para estes reparos.
- Projecto acessível é produção; jornada com escrita não executada.

## Implementado em desenvolvimento

- F01: matrícula interna atómica e tolerante ao reenvio, reutilizando `audit_logs.request_id`.
- F02: criação/activação do ano na mesma transacção, preservando índice de ano activo único.
- F03: rejeição explícita do excesso de linhas e de CSV inválido antes de qualquer escrita.
- F04: impedir E2E com escrita em produção antes de qualquer pedido.
- F08: MFA nos endpoints de grants e política restritiva preparada; logs de erro sem SQL/dados pessoais.
- Corrigir a confirmação enganadora de matrícula extraordinária: a base não admite excesso de lotação.
- SPECs por módulo, contratos, decisões e matriz de evolução.

## Bloqueado / por decidir

- Staging, contas por papel, destinos de mensagens e sandbox bancário indisponíveis.
- Nenhuma migração aplicada; novos RPCs preparados para revisão e ensaiados localmente.
- Não activar fornecedores, leaked-password protection, assinatura desktop ou alterar regras académicas sem configuração/decisão próprias.
- Não rodar segredos nem limpar escolas reais nesta execução.

## Evidências

Resultados das regressões e gates são registados em `evidencias/` à medida que concluírem. Build aprovado não equivale a jornada anual certificada.

## Contratos e validação a 08/10

[Índice de 30 SPECs](../../specs/README.md), 492 contratos inventariados,
[matriz de cenários corrigidos](matriz-verificacao.csv) e
[revisão/promoção/reversão SQL](REVISAO_SQL.md).

- Fixtures SQL atómico e MFA: passaram; cada migração executada duas vezes.
- `siga:check`: 13 testes de navegação aprovados e catálogo de módulos verificado.
- Auditoria de dependências: sem vulnerabilidades altas; cinco abaixo desse limiar permanecem (três baixos e dois moderados; detalhes em `dependency-audit-all.json`).
- Verificação de segredos nos documentos/evidências novos: zero correspondências com cinco valores secretos locais.
- Links das SPECs: zero caminhos em falta.
- Gate de publicação: bloqueado como esperado; dois RPCs e três políticas MFA ausentes do snapshot de produção.
- Regressões dos módulos afectados: 1 303 aprovadas, zero falhas e três ignoradas (`targeted-final.json`).
- Lint: zero erros e 47 avisos existentes (`lint-final.log`).
- Typecheck: aprovado, sem erros (`typecheck-final.log`).
- Suite completa: 3 119 aprovados, zero falhas e três ignorados (`full-tests-final.json`); não executou escrita integrada em produção.
- Build de produção: aprovado (`build-final.log`).

Sem commit, push, deploy ou escrita no banco de produção nesta execução. Não se declara
a jornada anual, concorrência real ou todos os módulos certificados. As alterações SQL
não criam tabelas/colunas novas; Observações usa o histórico existente.

## Resultado desta etapa

Correcções locais e SPECs entregues, com gates aprovados. A publicação continua bloqueada
pelo catálogo actual e pela aceitação integrada pendente. Há cinco avisos de dependências
abaixo do limiar alto; não se certifica toda a plataforma nem se declara a jornada anual concluída.
