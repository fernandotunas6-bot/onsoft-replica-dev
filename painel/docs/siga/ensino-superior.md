# Ensino Superior

Para instituições com licenciaturas e pós-graduações. O SIGA organiza o curso por
**plano curricular com créditos**, inscrições **por cadeira** e avaliação **por épocas**,
seguindo o regulamento académico da instituição.

O módulo aparece quando a escola tem o nível **Ensino Superior** (escolhido ao criar
a escola no WEB, ou em Definições → Pedagógico).

## Quem faz o quê

| Papel | Onde | O que faz |
| --- | --- | --- |
| Administrador | `/pedagogica/superior` | Cria e edita cursos, define o regulamento, tudo o que a secretaria faz |
| Secretaria | `/pedagogica/superior` | Monta planos, inscreve estudantes, credita cadeiras, emite históricos |
| Professor | `/pedagogica/pautas-superior` | Lança frequência e exames **só nas cadeiras que lecciona** |
| Estudante / Encarregado | Portal (início) | Vê créditos, média e o estado de cada cadeira; o estudante inscreve-se nas cadeiras se a escola abrir a matrícula on-line |

## 0. Ano lectivo por semestres

Uma instituição **só de Ensino Superior** trabalha por **dois semestres** (não trimestres):
em Calendário, o botão **Configurar semestres** sugere o 1.º e o 2.º semestre dentro do
ano lectivo; acerte as datas às épocas de exame. Se a escola tiver também ensino geral,
mantém os três trimestres (as pautas MAC/NPP/NPT são trimestrais).

## 1. Cursos

Em **Ensino Superior → Novo curso** (só Administrador):

- **Nome** — ex.: «Licenciatura em Direito».
- **Código** — único na escola; se ficar vazio, é feito a partir do nome (`DIREITO`).
- **Grau** — Bacharelato (3 anos por omissão), Licenciatura (4), Mestrado (2), Doutoramento (3)
  ou Especialização (1). Bacharelato e licenciatura são graduação; os outros, pós-graduação.
  O certificado de conclusão do bacharelato confere o grau de Bacharel.
- **Anos curriculares** — o SIGA cria os anos 1.º a N.º. Ao editar, os anos só se
  acrescentam (um ano com turmas não se apaga). Um curso pode ser desactivado.

Os estudantes ficam no curso pela **matrícula numa turma** de um dos seus anos (como
nos outros níveis).

## 2. Plano curricular

Separador **Cursos e plano**: para cada cadeira, o semestre do plano (1.º a 14.º) e os
créditos. As **precedências** dizem que cadeiras têm de estar concluídas antes; o SIGA
recusa precedências em ciclo e avisa de inconsistências (ex.: precedente num semestre
posterior). Uma cadeira com inscrições não sai do plano.

## 3. Regulamento académico

Separador **Regulamento** (só Administrador edita). Valores por omissão:

| Regra | Por omissão |
| --- | --- |
| Créditos máximos por ano / por semestre | 60 / 36 |
| Peso da frequência na época normal | 40 % (o exame vale 60 %) |
| Admissão a exame | frequência ≥ 7 |
| Dispensa de exame | frequência ≥ 14 (0 = sem dispensa) |
| Nota mínima de aprovação | 10 |
| Faltas máximas | 25 % (0 = sem limite) |
| Cadeiras em falta para época especial | até 2 |
| Tentativas por cadeira | sem limite (0) |
| Melhoria de nota | permitida |
| Matrícula on-line (o estudante inscreve-se no portal) | desligada |
| Trabalhador-estudante: faltas não excluem | ligado |
| Trabalhador-estudante: época especial sem ser finalista | ligado |
| Trabalhador-estudante: quanto conta cada ano (situação e prescrição) | 50 % |

**Trabalhador-estudante.** Ver a secção 8.

## 4. Inscrições por cadeira

- **Individual** — na ficha do estudante (separador **Estudantes**), escolher as cadeiras.
- **Em lote** — painel **Inscrição em lote**: turma (ou todo o curso) + semestre do plano.
  Cada estudante fica nas cadeiras que pode fazer; as restantes vêm com o motivo.

O SIGA recusa uma inscrição quando a cadeira já está concluída, já está em curso no ano,
tem uma inscrição de **outro ano sem resultado**, faltam precedências, se esgotaram as
tentativas, ou os créditos passam os limites do regulamento.

- **Pelo estudante (matrícula on-line)** — com a regra ligada no regulamento, o portal do
  estudante mostra o cartão **Inscrição em cadeiras**: as cadeiras por concluir, as que
  pode escolher e o motivo das bloqueadas. Valem as mesmas regras da secretaria, o
  **período de inscrições** e, se ligada, a regra das **propinas vencidas**. O
  encarregado não inscreve. Cada inscrição fica na auditoria; anular continua a ser na
  secretaria.

**Anular** — na ficha, numa cadeira em curso, com motivo. O painel **Inscrições sem
resultado de anos anteriores** lista as que ficaram abertas para lançar ou anular.

**Creditar** (equivalência) — conclui a cadeira sem nota: conta créditos, não entra na
média. Exige verificação em dois passos (2FA).

## 5. Épocas e lançamento

Em **Pautas do Superior** o professor escolhe a cadeira e vê só os botões das épocas a
que cada estudante pode ir:

1. **Frequência** — média de frequência e % de faltas.
   - faltas acima do máximo → *Excluído por faltas*;
   - frequência abaixo da admissão → *Excluído por frequência*;
   - frequência ≥ dispensa → *Aprovado* sem exame;
   - senão → *Admitido a exame*.
2. **Época normal** — só admitidos. Nota = frequência × peso + exame × (1 − peso).
3. **Recurso** — quem reprovou na normal. Nota = exame.
4. **Época especial** — finalistas (até N cadeiras em falta), numa cadeira reprovada ou
   com exclusão por frequência.
5. **Melhoria** — uma vez, depois de aprovar; fica a melhor das duas notas.

Se duas pessoas lançarem ao mesmo tempo, a segunda recebe «Esta inscrição mudou
entretanto» e nada se sobrepõe. Cada lançamento fica na auditoria.

**Imprimir pauta** — documento com resultados, totais e assinaturas (docente e secretaria).

## 6. Emolumentos

Separador **Emolumentos** (o Administrador altera): valores do exame de recurso, exame de
época especial, exame de melhoria e certidão de notas. Ficam no plano financeiro activo
(defina primeiro a propina em Definições → Financeiro). Cobram-se em **Faturas → Emitir
fatura**, escolhendo a categoria com o mesmo nome; 0 Kz = a instituição não cobra.

## 7. Histórico e progressão

- **Histórico académico** (botão na ficha do estudante) — uma linha por cadeira do plano
  com nota, época, ano lectivo e situação; créditos, média ponderada pelos créditos e
  situação no curso. Imprime ou guarda em PDF.
- **Situação** — ano curricular pelos créditos obtidos; **finalista** com até N cadeiras
  em falta; **concluiu** quando todas as cadeiras do plano estão feitas.
- **Portal** — o estudante e o encarregado vêem créditos, média e o estado de cada
  cadeira, só do próprio estudante.
- **Certificado de conclusão** (carta de curso) — quando o estudante conclui o curso, a
  Secretaria ou a Direcção carrega em **Emitir certificado** (pede a verificação em duas
  etapas). O certificado recebe o número de registo da escola (série «CE») e um código de
  verificação com QR: quem o recebe confirma-o em `/verificar`. Emitir de novo devolve o
  mesmo número e o mesmo código; só se imprime depois de emitido.

## 8. Trabalhador-estudante

Na ficha do estudante (separador Estudantes), a Secretaria concede o estatuto com a data de
início, a data de fim (opcional), a entidade empregadora e a prova (ex.: declaração do
empregador). Conceder e revogar exige verificação em duas etapas; os dados do estatuto só a
Administração e a Secretaria os vêem.

O Regulamento decide o que muda para quem tem o estatuto em vigor:

- **Faltas não excluem** da avaliação (por omissão, sim);
- **Época especial sem ser finalista** (por omissão, sim);
- **Quanto conta cada ano** para a situação académica e a prescrição (por omissão, 50 %).

Na pauta da cadeira, estes estudantes aparecem com a marca **TE**.

## Assistente de configuração

Em **Configurar a escola** (`/configuracoes/inicio`), uma escola com Ensino Superior
tem passos próprios: **regulamento definido**, **plano em todos os cursos** e
**emolumentos**; os períodos contam como semestres e o modelo MAC/NPP/NPT do ensino geral
não é pedido.
