# Horários configurados — complemento da PR #338

Base: `a4b36f90` do Claude. Ramo: `fix/horarios-configured-20261026`.
Não fundir a #338 uma segunda vez como contribuição independente deste ramo.

## Correcções

- A proposta automática exige a escolha explícita de um turno activo da escola.
  Os dias vêm de `active_days`; os tempos vêm de `school_shift_slots`, excluindo
  blocos eliminados e intervalos. Configuração vazia/inválida/sobreposta impede
  gerar; já não há fallback silencioso para 45 minutos, segunda–sexta ou pausas
  inventadas. A grelha pode ter sábado e tempos de 60 ou 90 minutos.
- A proposta envia `shiftId` ao caminho normal de criação, com todas as validações
  existentes no servidor. Escolher outro turno ou limite diário invalida a prévia.
- Limite de aulas da disciplina por dia passa a preferência ajustável (1–20).
  O valor inicial 2 não é apresentado como regra pedagógica universal.
- Candidatos respeitam a carga semanal do professor em minutos e só usam salas
  carregadas com lotação suficiente. A proposta não apresenta sala inexistente
  ou indisponível como solução. Recursos especializados e deslocações continuam
  sujeitos à validação curricular/institucional.
- Consultas do horário e das atribuições passam a páginas e lotes de IDs; removido
  o corte de 500 aulas na Pedagógica e no workspace do professor. Alteração
  equivalente à do ramo de integridade: conservar uma versão na integração.
- Falhas na consulta de turnos deixam de virar lista vazia silenciosa.
- A descrição do ICS identifica uma grelha/exportação pontual, sem afirmar que
  todo o conteúdo exportado é horário publicado ou que acompanha alterações.

## Evidência

- TypeScript e ESLint dos alterados: aprovados.
- Build cliente/SSR/Worker: aprovado, com avisos preexistentes de chunks e
  dependências. Não houve deploy.
- 210 ficheiros / **1.623 testes aprovados**, 17 ignorados, nas áreas academic,
  calendar, dashboard, import, security e rota Pedagógica. 24 verificações
  específicas de ferramentas/grelha/recursos incluídas na validação.
- Testes DOM verificam escolha de turno → gerar → aplicar. A validação visual
  com contas autenticadas, teclado real e dispositivos físicos continua pendente.

## Limites e próxima revisão

A proposta continua consultiva e a criação é aula a aula, com resultado parcial
explícito. A publicação deve validar a versão completa. O índice de qualidade é
heurístico, não homologação pedagógica. `weekly_periods` continua a contar os
blocos da atribuição; não se assume que um tempo equivale sempre a 45 minutos.
Antes de homologar carga curricular em minutos, ligar e verificar a duração
configurada em `curriculum_subjects.period_duration_minutes` nos consumidores.

Substituições persistentes, notificações do substituto, subscrição ICS de aulas
com excepções completas e calendários simultâneos por curso são evoluções de
contrato. O ICS da grelha não substitui a agenda publicada nem comprova presença.
Não foram inventadas tabelas, regras locais ou fornecedores para preencher essas
lacunas. Nenhuma migração nova neste complemento.
