# Listas financeiras de alunos — 28/10/2026

Base: `main` em `23a8f1c3a74b94dda7fb256bc156d62a12c1f3f6`, cópia limpa ao iniciar.
Ramo: `feat/accountant-student-lists`.

## Comportamento

Faturas → **Lista financeira dos alunos** abre uma lista por aluno no ano lectivo
seleccionado. Pesquisa por nome/processo; filtros por nível, curso, classe, turma e
situação: pago, parcial, dívida, vencida e sem facturas. Inclui alunos sem contrato,
sem os apresentar como pagos. Exportação CSV respeita todos os filtros.

Uma linha agrega as facturas dos contratos das matrículas do aluno naquele ano;
a turma é a matrícula activa, ou a mais recente se inactiva. Os saldos de outros
anos não entram: escolher o ano correspondente para consultar o histórico.
Facturas anuladas e recibos que não estejam emitidos ficam fora. Descontos e multas
já aplicadas entram; cálculos monetários usam cêntimos. Não é um extrato fiscal.

Seleccionar até 60 alunos activos da mesma turma permite emitir a propina do mês
pelo fluxo existente `issueInvoiceFor`. O servidor valida escola, turma, ano,
selecção integral e matrícula activa sem ambiguidade antes da primeira emissão.
Duplicados do mês são classificados como já existentes; erros individuais não
escondem os restantes resultados. Resultados e falhas ficam visíveis na lista.

Este lote **emite obrigações**; não regista pagamentos nem envia lembretes. Uma
dívida existente abre as facturas pelo nome do aluno, para usar o recebimento e
referências existentes. Envios de lembretes em massa não foram acrescentados.

## Matriz do incremento

| Módulo | Estado | Evidência | Endpoint | Perfil | Dependência / próximo passo |
| --- | --- | --- | --- | --- | --- |
| Lista aluno/ano e filtros | Implementado; testado local | student-ledger-server/panel tests | listStudentLedger | Administrador/Tesouraria | Ensaio no portal com sessão real |
| Cálculo pago/dívida/vencido | Testado local | student-ledger tests | listStudentLedger | Mesmo | Conferência com recibos reais autorizados |
| Emissão seleccionada | Implementado; contrato testado | tuition-batch tests; núcleo existente | issueTuitionBatch | Guardas existentes Admin/Tesouraria/Secretaria | Ensaio financeiro sem pagamentos reais |
| Exportação filtrada | Implementado | Helper CSV existente; colunas do painel | Cliente, só dados autorizados | Mesmo da leitura | Abrir CSV em Excel/LibreOffice |
| Desempenho / aparelhos | Parcial | Lazy chunk, pedido só ao abrir; paginação de 25 | Mesmo | Mesmo | Medir latência e Android de entrada |
| Isolamento remoto/RLS | Por validar | Base simulada com duas escolas; filtros explícitos | Mesmo | Mesmo | Sessões reais de duas escolas |

Não foi criado um papel global «Contabilista». O profissional usa o vínculo
financeiro autorizado da escola (Tesouraria); nenhuma permissão é concedida pela
interface. Contabilidade externa e custos de IA/API continuam fora deste fluxo.

## Persistência e segurança

Sem tabelas, SQL, migrações, credenciais ou alterações de RLS. Colunas confirmadas
nos types SGA e no snapshot de 25/10. Todas as leituras levam `school_id` resolvido
no servidor, com guarda financeira; o ano recebido apenas restringe a consulta.
Leituras por páginas de 1000 e ids em lotes de 150, incluindo recibos com várias
linhas por factura. Contratos, facturas e recibos restringidos ao ano através das
matrículas; não se lê todo o histórico financeiro da escola. Erros de leitura
bloqueiam o relatório. O tecto de 100.000 linhas gera erro, em vez de total parcial.

Chave de cache contém escola e ano. Mudança de contexto desmonta selecção e lote;
filtros persistem por escola/ano sem disputar o parâmetro `lf` da lista de facturas.
Pagamentos/facturas invalidam a lista via Realtime e invalidação das mutações.

## Verificação e limites

- `npm run build`: passou (Node 24; avisos de bundler já existentes).
- `npm run siga:check`: passou, incluindo 16 testes do catálogo de navegação.
- `npm run typecheck -- --pretty false`: passou com 8 GB de heap. Uma primeira chamada directa a tsc com heap por omissão esgotou memória; não foi erro de tipos.
- `npx vitest run tests/finance/ tests/ui/finance-installed-tools-context.test.ts tests/auth/access-policy.test.ts`: 58 ficheiros / 281 testes passaram.
- ESLint nos ficheiros alterados: passou.

Testes do servidor usam base simulada: não comprovam RLS remoto, sessões reais,
concorrência no Postgres, envio de notificações ou pagamentos. Testes DOM verificam
filtros, selecção homogénea e bloqueio da emissão, sem comprovar layout em aparelho.
Não foi feito deploy nem aplicada a migração de caixa. Reversão: reverter o commit
deste incremento; chamadas antigas de issueTuitionBatch continuam compatíveis.

## Estado histórico da entrega local

Implementação no commit local `72b4065`, ramo `feat/accountant-student-lists`.
Build, typecheck com heap de 8 GB, 281 testes financeiros/permissões, 16 testes
de navegação e ESLint passaram na sessão de implementação. Árvore de trabalho
limpa após o commit; nenhum deploy ou alteração de produção foi efectuado.

O envio do ramo ao GitHub foi bloqueado pela revisão automática: publicação de
código num remoto não verificado e mutação externa sem autorização explícita para
essa acção. Não foi tentada outra via de envio; não existe PR deste incremento.
Antes de nova tentativa, obter autorização explícita para enviar o ramo ao
repositório `fernandotunas6-bot/onsoft-replica-dev` e abrir a PR de revisão.

## Refinamento local — selecção e lista de cobrança

A selecção por página preserva alunos escolhidos noutras páginas e permite
retirar só a página actual. Se a união exceder 60 alunos, o botão fica desactivado;
não se corta a selecção silenciosamente. Alterar filtros continua a limpá-la.

«Exportar cobranças» gera um CSV apenas dos seleccionados com dívida positiva,
com ano lectivo, data de conferência, processo, aluno, turma, classe, curso, nível,
valor em dívida, parte vencida, valor pago e estado da matrícula. Alunos pagos ou
sem facturas são excluídos deste ficheiro. Matrículas inactivas com dívida também
podem ser seleccionadas, mas não podem receber novas propinas por este lote.

A lista apresenta a dívida dos seleccionados. A emissão conserva a exigência de
alunos activos, mesma turma não vazia e configuração financeira disponível. A
exportação não cria cobranças no fornecedor, não baixa pagamentos e não envia
mensagens. O bloqueio de publicação deste registo foi entretanto resolvido com autorização do proprietário; a PR #386 está aberta.

Validação deste refinamento: 20 testes da lista/lote passaram; a suite financeira
mais os testes de ferramentas e acesso passou com 283 testes em 58 ficheiros.
`npm run build` passou e ESLint dos dois ficheiros de código alterados passou.
Não houve novo ensaio remoto, RLS real ou validação em aparelho físico.

## PR #386 — correcção do CI e leitura com RLS

A publicação foi autorizada e concluída: PR #386, inicialmente em
`00c96c9aa7826f5f05ee5a992938089e3bf49210`. A primeira execução do CI
`40688289043` aprovou segurança de dependências, estilo, acessibilidade, lint,
build e tipos. Vitest falhou num teste de arquitectura: novo ficheiro privilegiado
fazia subir a dívida de 72 para 73. Os outros 5382 testes passaram, 19 saltados.

Antes de corrigir, foram lidas na produção **apenas metainformações** de
`pg_policies`, privilégios de SELECT e agregados de `role_permissions`, em
28/10/2026. Nenhum registo pessoal nem dado financeiro real foi consultado.
RLS e SELECT para authenticated existem nas dez tabelas usadas. Admin/owner têm
as sete permissões necessárias; treasury tem as cinco de pessoas/alunos/financeiro,
mas não `academic.structure.read` ou `academic.classes.read`. A função efectiva
`private.user_wide_reader_school_ids()` inclui Tesouraria.

Correcção: matrículas, alunos, pessoas, contratos, facturas e recibos passam pelo
JWT de `context.supabase` e respeitam RLS, além da guarda financeira e escola.
Só o catálogo académico (turmas, classes, cursos e níveis) usa o cliente
privilegiado, porque a Tesouraria não tem permissão RLS para o ler. Mantêm-se
as projecções mínimas e filtro da escola/ano nessas leituras. Não se concedeu
permissão nova, não se alterou RLS e não se introduziu fallback privilegiado para
dados pessoais/financeiros.

O teste de arquitectura conserva o tecto 72; regista a excepção por desenho só
para o catálogo académico, com a razão confirmada na base. Um teste funcional
confere a divisão exacta das seis tabelas lidas pela sessão e das quatro lidas
pelo cliente privilegiado. Os 13 testes específicos de leitura/arquitectura
passaram. A suite integral, build e tipos são novamente executados antes do envio.
Esta leitura de políticas não substitui um ensaio com sessões reais de dois
perfis/escolas nem valida as escritas financeiras em produção.

Validação final da correcção: `npx vitest run --maxWorkers=4` passou com 5384 testes
em 774 ficheiros; 19 testes/3 ficheiros saltados por dependências próprias dos
ensaios. Build, typecheck (depois do build) e ESLint dos ficheiros alterados
passaram. A suite integral inclui o teste que falhava no CI e o novo teste de
separação do cliente da sessão/catálogo. Estes resultados são locais; a nova
execução do GitHub Actions deve ser conferida no SHA enviado.

## Lista móvel e ensaio de navegador

A verificação visual encontrou tabela com scroll horizontal e alvos de selecção
com cerca de 12 px no telemóvel. A lista usa agora `ResponsiveEntityView`: cartões
abaixo de 768 px, tabela a partir desse limite, com a mesma selecção/filtros e
paginação. O label do checkbox oferece 44 × 44 px de toque sem aumentar a marca.
Um teste DOM verifica os valores no cartão e a selecção preservada na passagem
para tabela. O ensaio Chromium verificou nove larguras, teclado, contextos,
download CSV, formulário real com API fictícia, clique repetido, erros e retorno.

Reprodução, matriz, blob, comparação antes/depois e limites:
`docs/qa/finance/STUDENT_LEDGER_BROWSER_2026-10-28.md`.
Comando: `node scripts/qa/finance-student-ledger.mjs` (Chromium instalado).
A suite integral local passou com 5385 testes/19 saltados; build, tipos e lint
passaram. Ensaios reais de sessão/RLS e aparelhos físicos continuam pendentes.
