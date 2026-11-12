# Horários — tendências e funções (26/10/2026)

Pesquisa das ferramentas de referência e o que o SIGA passou a fazer em cada ponto.
Tudo assenta no modelo actual (`timetable_slots`, `class_subjects`, `academic_schedules`,
agenda publicada): **nenhuma migração nova**.

## O que as ferramentas de referência fazem

| Tendência                                                                                   | Quem                       | Fonte                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geração automática com regras explicáveis («porque não coube»)                              | aSc, Lantiv, Tes Timetable | [Classter](https://www.classter.com/blog/integrating-educational-technologies/comparing-timetable-software-for-schools-key-features-impact/), [FitGap aSc](https://us.fitgap.com/products/022108/asc-timetables) |
| Limites de furos dos professores e das turmas, dias mínimos entre aulas da mesma disciplina | FET, aSc                   | [FET (openSUSE)](https://en.opensuse.org/FET), [aSc](https://www.mockus.us/optimum/aSc/aSc.html)                                                                                                                 |
| Substituições: aulas em aberto e sugestões «conhece a turma», «conhece a disciplina»        | WebUntis                   | [Untis](https://www.untis.at/en/products/webuntis/online-substitution-planning), [ajuda Untis](https://help.untis.at/hc/en-150/articles/360010745399)                                                            |
| Vistas por professor, sala e turma; relatório de salas e professores livres                 | Bromcom, d6, Tes           | [Bromcom](https://docs.bromcom.com/?p=40137), [Tes](https://www.tes.com/for-schools/timetabling-edval/features)                                                                                                  |
| Exportar para iCal e PDF, subscrição em vez de exportação única                             | Sentral, TimeEdit          | [TimeEdit](https://student.nmh.no/en/programmes-courses/timetables-schedules/timetables-timeedit)                                                                                                                |
| Carga equilibrada: sequência mais longa, furos, distribuição pelos dias                     | Smartble, Tes              | [Smartble](https://www.smartble.net/blog/post/balance-teacher-workload-school-timetable/)                                                                                                                        |
| Mobile: próxima aula com contagem, cor por disciplina, intervalos assinalados               | apps de horário            | [Timetable – Widget](https://apps.apple.com/lb/app/timetable-widget/id6755498315)                                                                                                                                |
| Importar Excel/CSV com modelo, validação antes de gravar e pré-visualização                 | RosarioSIS, Edrolo, Meshed | [RosarioSIS](https://rosariosis.org/modules/timetable-import), [Edrolo](https://help.edrolo.com.au/hc/en-us/articles/14331250301839)                                                                             |

## Funções novas

Pedagógica → Horários → **Ferramentas do horário** (`ScheduleToolsPanel.tsx`):

| #   | Função                                                                                                                                              | Código                                                        | Testes                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| 1   | Qualidade do horário da turma (furos, disciplina 3× no dia, dias desequilibrados, concentração; 0–100)                                              | `utils/insights.ts › classTimetableQuality`                   | `tests/academic/schedule-tools.test.ts` |
| 2   | Carga dos professores (aulas, horas, dias, aulas seguidas, furos, limite semanal)                                                                   | `teacherLoads`                                                | idem                                    |
| 3   | Ocupação das salas                                                                                                                                  | `roomOccupancy`                                               | idem                                    |
| 4   | Salas livres num tempo, pela lotação da turma                                                                                                       | `freeRooms`                                                   | idem + `schedule-tools-panel.test.tsx`  |
| 5   | Substitutos livres para uma aula, ordenados como no WebUntis                                                                                        | `substituteCandidates`                                        | idem                                    |
| 6   | Exportar CSV com as colunas do modelo de importação (reimportável)                                                                                  | `utils/exporters.ts › timetableCsvColumns`                    | idem                                    |
| 7   | Exportar calendário .ics com cada aula a repetir até ao fim do ano lectivo                                                                          | `timetableIcs` + `RRULE` em `calendar/ics.ts`                 | idem                                    |
| 8   | Proposta automática: só os tempos em falta, sem conflitos, até 2 por dia, sem furos, com a razão do que não coube; aplica aula a aula pelo servidor | `utils/autoSchedule.ts` + `onCreateSlots` em `pedagogica.tsx` | idem                                    |

Portais do aluno, encarregado e professor (`StudentTimetableCard.tsx`, `timetable-week.ts`):

| #   | Função                                                         | Testes                                                                                           |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 9   | Navegar entre semanas (servidor aceita `weekStart`)            | `tests/calendar/portal-agenda-server.test.ts`, `tests/dashboard/student-timetable-card.test.tsx` |
| 10  | «Agora» / «A seguir (daqui a N min)» / «Próxima aula: amanhã…» | `tests/dashboard/timetable-week.test.ts`                                                         |
| 11  | Feriados nacionais da semana assinalados                       | card                                                                                             |
| 12  | Legenda com as aulas por disciplina; tocar destaca uma         | card                                                                                             |
| 13  | Exportar a semana para o calendário do telemóvel               | card                                                                                             |
| 14  | Imprimir só a grelha (A4 deitado)                              | card + `timetable-week.test.ts`                                                                  |

Visual (26/10, já na branch): cor por disciplina, um dia de cada vez no telemóvel, aula em
curso, aulas passadas e intervalos.

## Importação de horários refinada

`src/features/import/importers/horarios-importer.ts` (testes em
`tests/import/horarios-importer-refinements.test.ts`):

- células de hora do Excel deixavam de ser «1899-12-30» (`engine/parse.ts`) — cada horário em
  `.xlsx` com células de hora era recusado;
- horas «7h30», «07h», «7.30», fracção do dia e número de série; dias «2ª feira», «seg.»,
  inglês, domingo;
- aulas canceladas ou arquivadas deixam de contar como conflito;
- sala ligada ao cadastro (`room_id`), conflito de sala como na base (sem maiúsculas, ignora
  «Sala»/«A definir»), turno inferido (`shift_id`);
- professor também pelo nome (recusa nomes repetidos); turmas só do ano da importação;
- a pré-visualização vê conflitos e repetições entre linhas do mesmo ficheiro e avisa da
  carga semanal ultrapassada;
- a disciplina criada pela importação nasce com 1 tempo e cresce com cada aula (antes 4
  fixos, e a publicação recusava «carga não corresponde»).

## Limites conhecidos

- A Pedagógica carrega até 500 aulas do ano (`listPedagogicalWorkspace`): numa escola maior,
  salas livres e substitutos olham só para essas.
- Os substitutos são sugestões: não há tabela de substituições nem aviso ao professor
  escolhido; a troca faz-se editando a aula.
- O .ics exportado é uma fotografia: não acompanha alterações posteriores (subscrição por
  token fica para depois).
- A proposta automática não é transaccional: aplica aula a aula e relata as recusas.
- Validado em testes e em capturas do componente; falta a validação em dispositivo físico e
  no portal autenticado (ver `docs/design/VISUAL_MASTER_STATUS.md`).
