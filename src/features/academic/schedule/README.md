# Submódulo de Horários

Este directório concentra extensões de horários do módulo académico. A sidebar mantém a rota existente para `Pedagógica > Horários` e não deve apontar diretamente para componentes deste directório.

`ScheduleWorkspace.tsx` contém a interface da aba existente, `types.ts` concentra os contratos e `utils/conflicts.ts` valida conflitos apresentados ao utilizador. `services/calendar.ts` mantém as utilidades de calendário sem depender de dados fictícios.

O horário de produção continua em `src/routes/pedagogica.tsx`, com dados e permissões em `src/features/academic/server.ts` através de `timetable_slots`. As operações de criar, editar, copiar e remover usam ações autenticadas do módulo académico.
