# Alunos e matrículas

## Três formas de ter alunos no SIGA

| Forma             | Quando usar                                                                           |
| ----------------- | ------------------------------------------------------------------------------------- |
| Matrícula interna | A Secretaria regista o aluno, o encarregado e a turma em **Alunos → Nova matrícula**. |
| Matrícula online  | A família preenche o formulário público da escola e a Secretaria aceita ou recusa.    |
| Importação        | A escola já tem listas em Excel. Use os modelos oficiais em **Importar**.             |

## Ficha do aluno

A ficha reúne dados pessoais, encarregados, matrícula, notas, frequência, financeiro e documentos.

- O BI, o NIF e o telefone +244 são validados no formato angolano.
- Antes de criar uma pessoa, o SIGA procura duplicados. Pessoas repetidas podem ser fundidas no registo central em **Pessoas**.
- Da ficha emitem-se boletim, histórico, declaração e outros documentos oficiais.

## Estados do aluno

| Estado                             | Significa                               |
| ---------------------------------- | --------------------------------------- |
| Candidato                          | Pedido de matrícula ainda sem turma.    |
| Activo                             | Matriculado numa turma do ano corrente. |
| Suspenso ou bloqueado              | Acesso temporariamente retirado.        |
| Transferido, desistente ou anulado | Saiu da escola. O histórico mantém-se.  |
| Graduado                           | Concluiu o curso. Pode passar a Alumni. |

Em **Alunos** é possível mudar o estado de vários alunos de uma vez e atribuir turma em lote. O SIGA verifica a lotação da turma antes de mudar alguém, e mudar o estado fica registado na auditoria.

Para mudar um aluno de turma, use **Alterar turma** na ficha do aluno. A matrícula, as notas e o contrato financeiro continuam os mesmos; a nova turma tem de ser do mesmo ano lectivo e ter vaga. Para o ano seguinte faz-se uma matrícula nova.

## Matrícula online

1. Em **Definições → Matrícula pública**, abra o formulário e escolha os campos.
2. Partilhe o link da escola. O formulário fica em `/matricula/` seguido do identificador da escola.
3. As candidaturas chegam à lista de matrículas. Ao aceitar, o SIGA cria o aluno, o encarregado se tiver sido indicado, e pode já colocar o aluno numa turma.

## Importação por Excel

1. Em **Importar**, escolha o tipo de dados e descarregue o modelo oficial.
2. Preencha e carregue o ficheiro. O SIGA sugere a correspondência das colunas.
3. Reveja as linhas na pré-visualização e corrija o que estiver assinalado.
4. Confirme. Uma importação pode ser revertida a partir do histórico.

Há importadores para alunos, encarregados, professores, funcionários, turmas, disciplinas, salas, horários, matrículas, inscrições, notas, pautas, presenças, propinas, pagamentos, dívidas e históricos.
