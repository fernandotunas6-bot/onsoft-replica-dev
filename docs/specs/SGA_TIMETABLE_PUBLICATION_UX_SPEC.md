# SIGA Plus — especificação funcional e visual dos horários

## Entidades e relações obrigatórias
- Instituição → ano letivo → nível de ensino → curso/plano curricular (quando aplicável) → classe → turma → versão do horário.
- Disciplina: código institucional, nome, carga semanal, tipo (obrigatória/optativa/prática), nível, plano curricular, pré-requisitos quando aplicáveis; só oferecer disciplinas elegíveis para a turma.
- Atribuição: turma + disciplina + professor + estado; impedir referências entre escolas e docentes não autorizados.
- Professor: vínculo institucional ativo, disciplinas habilitadas, disponibilidade semanal, limite de carga horária e incompatibilidades entre turmas.
- Sala: campus, edifício, código, tipo (normal, laboratório, informática, auditório, virtual), capacidade, recursos e disponibilidade.
- Turno: manhã/tarde/noite, dias, início/fim, intervalos, duração e quantidade de tempos letivos; aulas devem caber no turno, exceto exceção expressa.
- Aula: versão, turma, disciplina atribuída, docente, sala, dia 1–7, início/fim com precisão de segundos, turno, número do tempo, modalidade e observações.
- Versão: rascunho → revisão → aprovada → publicada → arquivada, vigência inicial/final, responsável, data de publicação e histórico de alterações.

## Regras de integridade
1. Validar escola em todas as FKs, incluindo sala, turno, turma, disciplina e versão; manter RLS independente dos triggers de integridade.
2. Uma aula ativa não pode sobrepor outra da mesma turma, docente ou sala na mesma versão. Duas versões publicadas com vigências sobrepostas não podem ocupar o mesmo recurso.
3. Uma alteração de professor ou turma deve revalidar todas as aulas afetadas, inclusive versões publicadas; um horário publicado não pode ser alterado silenciosamente sem trilho de auditoria.
4. Rejeitar dia inválido, hora final anterior/igual à inicial, duplicação de aula, docente inativo, sala inadequada e lotação insuficiente; distinguir aviso de impedimento.
5. Respeitar disponibilidade, pausas, feriados, limites de carga, requisitos de laboratório e regras por nível. Dados ainda não disponíveis devem produzir pendência explícita, não uma aprovação fictícia.
6. Publicar apenas uma versão consistente, com datas válidas, responsável autorizado e validação transacional. Definir política de substituição/arquivamento da versão anterior e preservar histórico.
7. Serializar operações por instituição com ordem consistente de locks **antes** de bloquear linhas nas operações concorrentes; verificar com duas conexões em staging.
8. A aplicação deve refletir erros do banco sem afirmar sucesso antecipadamente.

## Fluxo de publicação
- Selecionar instituição, ano, nível, turma e versão; rever disciplinas, professores, salas, dias e períodos.
- Pré-visualizar a grelha e executar checklist de pendências: aulas vazias, vínculos inválidos, lotação, conflitos e datas.
- Confirmar publicação com resumo da versão e vigência. Executar validação no servidor dentro da transação e registrar autor e instante.
- Disponibilizar versão publicada nos portais autorizados, calendário escolar e impressão; permitir substituição controlada, nunca sobrescrever o histórico.
- **Estado atual da interface:** checklist local de aulas, disciplina, professor, sala, lotação e conflitos; a verificação de vigência e publicação transacional pertence ao backend e não deve ser declarada concluída só com validação visual.

## Experiência visual
- Cabeçalho com ano letivo, nível/turma e estado da versão; indicadores de aulas, docentes, salas e pendências.
- Modos por turma/professor/sala, pesquisa, semana útil ou fim de semana conforme aulas visíveis, cartões com disciplina, professor, sala e hora.
- Cores institucionais consistentes, cartões arredondados, foco de teclado, contraste acessível, estados vazios claros, responsividade e impressão A4 horizontal.
- Em caso de simultaneidade, exibir **todas** as aulas sem ocultar nenhuma; apresentar conflitos de forma acionável.

## Testes e aceitação
- Unitários: horas com segundos, aulas simultâneas, capacidade, vínculos ausentes, conflitos, isolamento de turmas e fins de semana.
- Integração: permissões por escola, níveis de ensino, disponibilidade docente, publicação e substituição de versões, auditoria.
- Concorrência: duas sessões READ COMMITTED criando aulas sobrepostas e alterando atribuições/publicações; garantir um vencedor e nenhum deadlock.
- Visual: desktop/móvel, teclado, leitores de ecrã, impressão e estados com muitas aulas.
- Não implantar triggers pendentes sem testes de concorrência e RLS em staging.
