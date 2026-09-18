# Facturação completa, conta de administrador e área de gestão

## O problema principal que encontrei

O painel de facturação (Financeiro e Facturas) foi escrito para a base de dados do
outro servidor da escola: procura registos chamados `finance_invoices`,
`finance_receipts`, `siga_cash_expenses`, `fee_plans` e `finance_contracts`, que
**não existem** nesta base. Aqui as facturas, os recibos e a caixa estão gravados
noutros registos (`invoices`, `payments`, `cash_entries`). É por isso que as
páginas de dinheiro aparecem vazias e o painel inicial não mostra fluxo financeiro.

O mesmo acontece no painel inicial: a parte financeira lê os registos antigos, logo
nunca mostra nada.

## O que vou fazer

### 1. Facturação ligada a esta base
- Ligar Financeiro e Facturas aos registos reais desta base: facturas, linhas de
  factura, recibos, pagamentos em dinheiro, despesas e anulações.
- Pagamentos em dinheiro com recibo, saldo de caixa e extrato de movimentos
  (entradas, saídas, saldo corrente), usando as funções de resumo já instaladas
  (`finance_summary`, `finance_monthly_summary`, `finance_category_summary`).
- Emitir factura, receber pagamento, registar despesa e anular movimento a partir
  da página, com confirmação e mensagens de erro claras.

### 2. Painel inicial com fluxo financeiro
- Substituir a leitura antiga pelos resumos reais: facturado, recebido, em dívida,
  em atraso, saldo de caixa e gráfico dos últimos 6 meses.
- Cartões clicáveis que levam a Financeiro e Facturas.

### 3. A sua conta de administradora e dados de arranque
- Criar a sua conta de administração da escola e ligá-la à escola.
- Gravar um conjunto de dados de arranque realista (ano lectivo, cursos, classes,
  turmas, salas, disciplinas, professores, alunos com encarregados, matrículas,
  horário semanal, notas por período e propinas com facturas e recibos), para que
  nenhuma página fique vazia.
- Entrar no sistema e percorrer, página a página: Turmas e Horários, Professores e
  Funcionários, Matrículas, Notas e Avaliações, Financeiro e Facturas — e corrigir
  o que não mostrar dados.

### 4. Importação completa com validação
- Os quatro ficheiros pedidos passam a ter modelo próprio, leitura e gravação:
  turmas, alunos, pautas e horários (horários é o que falta hoje).
- Validação linha a linha antes de gravar: campos obrigatórios, datas, notas fora
  de 0–20, turma/disciplina/aluno inexistentes, duplicados.
- Ecrã de erros: cada linha problemática com o motivo e possibilidade de corrigir
  no ecrã e repetir, além do resumo que já existe.

### 5. Área de administração
- Nova página de administração com: utilizadores da escola (convidar, activar,
  desactivar), papéis e permissões por módulo, e gráficos de alunos, matrículas e
  notas (evolução, distribuição por turma, aproveitamento).
- Registo de quem alterou o quê.

## Sobre os seus ficheiros reais
Os ficheiros Excel/CSV de turmas, alunos e pautas ainda não chegaram. Vou preparar
tudo e testar a importação com ficheiros de exemplo no formato dos modelos
oficiais; quando anexar os seus, importo-os na mesma hora e confirmo que as
matrículas e as notas aparecem em Turmas e em Notas e Avaliações.

## Notas técnicas
- Reescrita de `src/features/finance/server.ts` e dos ecrãs `financeiro.tsx` /
  `faturas.tsx` para o esquema actual; leitura por RPC onde já existe.
- `src/features/dashboard/server.ts`: bloco financeiro passa a usar
  `finance_summary` / `finance_monthly_summary`.
- Importação: novo importador de horários em `src/features/import/importers/`,
  registo no catálogo e painel de erros nos componentes do assistente.
- Nova rota `src/routes/admin.tsx` com gestão de utilizadores e gráficos
  (recharts), protegida por papel de Administrador.
- Verificações: tipos, testes, análise de código e medições de velocidade antes
  de publicar; sincronização com o GitHub continua a ser iniciada por si.
