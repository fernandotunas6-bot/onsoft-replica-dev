# SIGA Plus — períodos lectivos, turnos, intervalos, catracas e presença docente

**Estado:** motor de domínio e testes no PR #26; integração com ecrãs, calendário persistido, APIs, dispositivos e folha salarial ainda não concluída. Nenhuma migração de produção incluída.

## 1. Estrutura temporal e autoridade
A instituição configura ano lectivo, períodos não sobrepostos (início/fim inclusivos), dias lectivos ISO (segunda=1, domingo=7), turnos, blocos de aula e intervalos. Datas no formato AAAA-MM-DD; horas no formato HH:mm com precisão de minuto. Não usar uma constante de 22 dias: gerar as datas reais do mês e cruzar com o calendário, feriados e contrato.

**Exemplo ilustrativo, não configuração legal ou calendário oficial:**

| Elemento | Início | Fim | Regra |
|---|---|---|---|
| Entrada antecipada | 07:00 | 07:30 | Janela de catraca, sem contar como aula |
| Turno manhã | 07:30 | 12:30 | Presença no recinto não prova leccionação |
| Aula 1 | 08:00 | 09:00 | Bloco lectivo |
| Aula 2 | 09:00 | 10:00 | Bloco lectivo contíguo; sem conflito |
| Intervalo | 10:00 | 10:20 | Não integra minutos lectivos |
| Aula 3 | 10:20 | 11:20 | Bloco lectivo |
| Saída | 12:30 | 12:45 | Janela de catraca, sem contar como aula |

O período, o turno e os blocos devem ser configurados por escola e nível de ensino. Horários nocturnos que atravessem a meia-noite exigem divisão explícita por data; o motor actual rejeita turnos nocturnos transversais ao dia. Uma aula deve estar totalmente contida num bloco lectivo, não pode ocupar intervalo ou lacuna e não pode colidir com outra aula da mesma turma, docente ou sala na mesma data.

## 2. Geração de aulas datadas
O motor academicTime.ts expande aulas semanais em ocorrências datadas apenas dentro do período lectivo e nos dias de semana correspondentes. Feriados e exclusões têm precedência sobre dias extraordinários; um dia extraordinário não pode estar fora do período, nem duplicar automaticamente todas as aulas de dias de semana diferentes. As ocorrências são ordenadas cronologicamente; qualquer erro de configuração impede a publicação do lote.

**Importante:** os campos startsAtLocal e endsAtLocal são horários civis da instituição e não instantes UTC. A API deve associar o fuso IANA da escola e converter com uma biblioteca de fusos no servidor. Não concatenar Z nem confiar no fuso do dispositivo do docente.

## 3. Cronometragem de presenças
Para cada ocorrência publicada, gerar duas operações independentes: início e fim. O servidor regista o seu próprio timestamp e valida janela temporal, escola, professor, aula, versão publicada, nonce de uso único e expiração. A catraca regista entrada/saída do recinto separadamente. Intervalos e aulas canceladas não contam como faltas lectivas. Substituições, aulas repostas, licença e justificações exigem estados próprios e revisão antes do fecho.

A regra de folha salarial exige identidade, quantidade **e duração** de todas as aulas oficiais, evidências verificadas e aprovação do RH. Nenhuma proposta de desconto deve surgir se houver uma aula pendente ou discrepância com o horário publicado. A aplicação de descontos reais depende de política contratual e enquadramento jurídico validado.

## 4. Integração pendente, por ordem
1. Persistir períodos, turnos, blocos, intervalos, calendário de exceções e versões de horário por school_id com RLS, índices e auditoria.
2. Criar CRUD e pré-visualização visual por escola/nível/turno, sem permitir alterações retroactivas silenciosas de horários publicados.
3. Conectar o motor à criação/edição/publicação do ScheduleWorkspace e gerar ocorrências imutáveis datadas; bloquear publicação com erros.
4. Expor RPC transacional de QR, com consumo atómico de nonce, restrições únicas por escola/aula/docente/operação e ensaios de concorrência.
5. Integrar gateway de catraca por fabricante, fila offline cifrada, relógio sincronizado, deduplicação persistente e quarentena.
6. Integrar painel do docente e do RH com relatórios de aulas previstas, leccionadas, atrasos, saídas antecipadas, justificações e contestação; executar testes automatizados, staging e piloto com equipamento físico.

**Critério de libertação:** testes de unidade, integração e concorrência efectivamente executados, build e verificação de tipos sem erros, RLS entre escolas, validação da legislação aplicável, revisão humana do fecho e ensaio físico da catraca. Não declarar produção pronta antes disso.

## 5. Reposição e apuramento mensal por ocorrência

- Reposição de aulas usa mapeamento explícito `recoveryDays: [{ date, followsWeekday }]`: a escola pode determinar que um sábado siga o horário de segunda-feira. A data deve estar dentro de um período válido e não pode coincidir com feriado, exclusão ou outra exceção extraordinária. O calendário não copia indiscriminadamente todos os dias.
- `monthlyLessonRoster.ts` transforma ocorrências datadas de um docente em identificadores `idDaAula@AAAA-MM-DD`, minutos previstos por ocorrência e total mensal, sem contar intervalos. A projeção rejeita planos com conflitos, duplicações e timestamps locais incoerentes.
- Esta projeção é preparatória. A API deve gerar o roster apenas a partir da versão **publicada e imutável** do horário e das substituições autorizadas, com fuso IANA, `school_id` e versão do calendário. O cliente não pode escolher ou alterar o roster usado para aprovar descontos.
