# Lista financeira — ensaio no navegador, 28/10/2026

## Âmbito e resultado

Componente real `StudentLedgerPanel`, estilos Inter/SIGA, filtros, checkbox,
paginação, estados, formulário QuickForm e router TanStack reais. Chromium 140
headless em Linux. Dados de 73 alunos fictícios, com nome/curso extensos,
pagamentos parciais e matrícula inactiva. A sessão, escola e respostas do servidor
são substituídas por fixtures; pedidos externos são bloqueados pelo ensaio.
Nenhuma cobrança ou pagamento real é executado.

Resultado: passou. Componente conferido pelo blob
`b650ce9b6e50b44cdde7eb51554f41b79c3a23f3`.

| Largura × altura CSS | Vista | Filtros / selecção por página | Página sem overflow horizontal |
| --- | --- | --- | --- |
| 320 × 800 | Cartões | Passou | Passou |
| 360 × 800 | Cartões | Passou | Passou |
| 390 × 844 | Cartões | Passou | Passou |
| 640 × 360 | Cartões, horizontal | Passou | Passou |
| 767 × 900 | Cartões | Passou | Passou |
| 768 × 1024 | Tabela | Passou | Passou |
| 1023 × 900 | Tabela | Passou | Passou |
| 1024 × 768 | Tabela | Passou | Passou |
| 1440 × 1000 | Tabela | Passou | Passou |

A tabela de tablet/desktop conserva o seu contentor de scroll quando necessário;
o ensaio verifica que não alarga o documento inteiro. No telemóvel, os cartões
mostram Pago, Dívida e Vencida juntos, sem deslocamento horizontal.

## Defeitos observados e correcções

Antes: em 320 px, a tabela media 586 px num contentor de 276 px. A dívida e o
estado exigiam deslocamento horizontal, e o curso extenso criava linhas muito
altas. O checkbox tinha aproximadamente 12 × 12 px de área interactiva.

Depois: `ResponsiveEntityView` escolhe cartões abaixo de 768 px e mantém a tabela
nos restantes degraus. Dados, filtros, paginação e selecção continuam na mesma
instância de estado. O controlo mantém a aparência institucional; um label de
44 × 44 px alarga a área de toque, confirmado por clique no canto e medição do
rectângulo no navegador. Tecla Space continua a alternar a selecção.

## Percursos adicionais aprovados

- Ordem de Tab nos filtros e selecção por Space.
- Mudança de escola/ano limpa a selecção e consulta o novo contexto.
- Download CSV real contém só o devedor seleccionado, processo e ano correctos.
- Diálogos em 320 × 800 e 640 × 360 ficam dentro do viewport; foco permanece no
  diálogo e Escape fecha o formulário sem alterações.
- No formulário real, preencher vencimento e clicar duas vezes gera um único
  pedido à API de ensaio e mostra o resultado recebido. Não prova idempotência
  na base; a emissão real continua a usar o núcleo financeiro existente.
- Link do aluno navega pelo router real para `/faturas?aluno=…` no destino da
  fixture; não testa a página protegida de produção.
- Estados vazio, erro e tentar novamente.
- Nenhum erro JavaScript não tratado, nem tentativa de pedido externo.

## Reproduzir

Com as dependências do projecto instaladas:

```sh
npx playwright install chromium
node scripts/qa/finance-student-ledger.mjs
```

O comando inicia e fecha o servidor local e o navegador no mesmo processo de
ensaio. Gera `reports/finance-student-ledger/report.json` e capturas PNG. Essa pasta
é ignorada no Git; as capturas são reproduzíveis e só contêm dados fictícios.
O relatório regista HEAD de origem e blob do componente, para não confundir uma
árvore de trabalho alterada com o código de um commit anterior.

## Limites

É um ensaio do componente em navegador, com backend e contexto de conta
simulados. Não valida AuthGate/AppShell, sessões reais, RLS remoto sob JWTs reais,
pagamentos, concorrência do fornecedor, hardware Android/iOS, Safari/Firefox,
leitor de ecrã nem Web Vitals de produção. A largura de 320 px verifica reflow;
não equivale a ensaiar todos os níveis de zoom do navegador. Movimento reduzido
é solicitado no contexto do navegador. A validação com perfis reais e aparelhos
continua pendente.

Verificação local complementar: 5385 testes passaram (19 saltados), build,
typecheck depois do build e lint dos ficheiros alterados passaram. O CI anterior
aprovado é o de `f95a752`; a alteração móvel exige conferir a nova execução.
