# SIGA Plus — Catracas, confirmação de aulas por QR e apuramento docente

**Estado:** especificação e motor de cálculo inicial; integração física, portal, API, persistência e folha salarial ainda pendentes. Não ativar descontos em produção sem validação jurídica e aprovação do RH.

## 1. Configuração institucional
- Isolar tudo por `school_id`; fuso horário IANA por escola, por exemplo `Africa/Luanda`. Aulas e eventos persistidos em UTC, com visualização no fuso institucional.
- Definir turnos, tolerâncias, horários de entrada/saída, intervalos, calendário, feriados, fins de semana, jornadas parciais e exceções. **22 dias úteis é uma referência configurável**, não constante do motor. Calcular o calendário efetivo de cada mês e contrato.
- Definir zonas, edifícios, portas, dispositivos e sentido de circulação. Catraca de entrada/saída não equivale a presença numa aula.
- Cadastro do docente com vínculo institucional, turmas/disciplinas, horário publicado e contrato vigente. Docentes partilhados por escolas exigem escopo explícito.

## 2. Catracas e operação offline
- Adaptador por fabricante (API/SDK ou gateway local), eventos assinados ou autenticados via credenciais por dispositivo; nunca confiar em identificadores de escola enviados sem validação.
- Evento: ID imutável do dispositivo + sequência, instituição, docente, porta, direção, timestamp do dispositivo, timestamp de receção e resultado de validação.
- Chave de idempotência por dispositivo + ID do evento; proteção contra replay; fila local cifrada e sincronização quando a ligação regressar.
- Detectar relógio desalinhado, duplicados, passagens impossíveis, saídas sem entradas, dispositivos offline e acesso recusado. Permitir auditoria de correções sem apagar o evento original.
- Modo de emergência, evacuação e desbloqueio físico devem funcionar independentemente da aplicação.

## 3. Portal docente — início e fim de cada aula
1. A partir do horário publicado, abrir a aula correspondente ao professor autenticado, instituição e turma.
2. O QR deve ser dinâmico, de uso único, com nonce aleatório, validade curta, identificador da aula/versão, tipo de operação (entrada/saída), instituição e dispositivo emissor. Assinatura e validação exclusivamente no servidor.
3. O professor lê o QR com o scanner no seu portal; o servidor valida sessão/MFA conforme risco, autorização, janela temporal, nonce não reutilizado e atribuição vigente.
4. Entrada e saída são **eventos distintos**. A catraca é evidência complementar de presença no recinto; não substitui o QR da aula. Aulas online precisam de método equivalente definido pela escola.
5. Sem saída, com QR expirado ou com rede indisponível: `pending_review`, nunca ausência definitiva automática. RH/direção podem aprovar justificações com trilho de auditoria.
6. Prevenir troca de telemóvel, QR fotografado e apresentação por terceiros com QR curto, atestado de dispositivo quando disponível e verificações proporcionais; nunca alegar que QR isolado comprova identidade ou permanência.

## 4. Apuramento financeiro
- Unidade: minutos letivos previstos vs. minutos confirmados por aula. Separar atraso, saída antecipada, ausência não justificada, cancelamento institucional, feriado, licença, substituição e aula reposta.
- Carga horária contratual mensal e base remuneratória são parâmetros de RH; a jornada de 22 dias só entra quando prevista no calendário e contrato aplicáveis.
- `previewPayroll` devolve **simulação em cêntimos de AOA**, sem lançar movimentos financeiros. `deductionEnabled=false` por padrão na integração futura.
- Nenhum desconto sobre `pending_review`, aula cancelada ou ausência justificada. Antes de qualquer desconto real: confirmação do contrato, norma laboral aplicável, regras de arredondamento, validação humana, aprovação RH e direito de contestação.
- Desconto calculado por minutos contratuais **apenas quando a política contratual/jurídica aprovada autorizar**. Não converter automaticamente uma aula perdida em um dia de salário.
- Fecho mensal versionado, relatório de alterações, recibo de vencimento e integração com folha salarial existente; nunca editar silenciosamente mês fechado.

## 5. Modelo de dados proposto
- `access_devices`: dispositivo, fabricante, credencial cifrada fora da tabela, escola, porta, estado.
- `gate_access_events`: evento externo único, docente, direção, horários dispositivo/servidor, integridade, estado.
- `lesson_attendance_challenges`: nonce **armazenado apenas como hash**, expiração, aula, operação, escola, consumido em.
- `lesson_attendance_events`: aula, versão publicada, docente, entrada/saída, origem, instante, challenge, verificação, auditoria.
- `lesson_attendance_reviews`: justificação, evidências, decisão, aprovador, data, histórico imutável.
- `teacher_monthly_attendance`: período, escola, docente, carga prevista, minutos confirmados, exceções, estado e versão de fecho.
- `payroll_attendance_adjustments`: referência ao fecho, valor em cêntimos, base jurídica/contratual, aprovadores, estado e ligação à folha.

**Segurança:** RLS por instituição e papéis; RPC transacional com bloqueio/idempotência; separação entre docente, coordenação e RH; retenção e privacidade definidas antes da implantação. Não armazenar biometria bruta no SIGA.

## 6. Critérios de aceitação
- Dois scans simultâneos do mesmo QR: apenas um aceite.
- QR expirado, adulterado, de outra escola ou de outro professor: rejeitado e auditado.
- Aula sobreposta, versão substituída, substituição autorizada e saída anterior à entrada: regras determinísticas.
- Rede indisponível, relógio do equipamento errado e evento duplicado da catraca: nenhuma falta nem desconto automático.
- Reprocessamento mensal idempotente; ajustes exigem aprovação, justificativa e recibo auditável.
- Testes com dois utilizadores concorrentes e dois dispositivos; ensaio com o fabricante da catraca e ambiente de staging antes de produção.

## 7. Refinamento do motor e calendário

- O motor `attendanceEngine.ts` trata leituras QR duplicadas ou contraditórias, saída anterior à entrada, duração superior a 24 horas e eventos fora da janela como `pending_review`; chegadas tardias dentro da aula continuam elegíveis para apuramento de atraso ou permanência parcial.
- `workCalendar.ts` calcula os dias úteis do mês a partir dos dias semanais institucionais, feriados e exceções; 22 dias é apenas referência de apresentação. A folha deve utilizar carga horária e calendário do contrato efetivamente aplicável.
- O motor de prévia deste documento é preparatório. O SIGA já possui server functions de QR autenticadas e persistência RH próprias; falta confirmar a ligação segura ao novo esquema de evidência, publicação do horário e fecho salarial. Não tratar verificações no navegador como evidência suficiente para remuneração.
- Pendente: ensaios de integração, testes automatizados executados, validação laboral em Angola, política de retenção e piloto em staging com equipamento real.

## 8. Invariantes adicionais para implementação da API

- A comparação mensal deve usar **identificadores exatos** das aulas publicadas, além da contagem. `expectedLessonIds` e `expectedLessonCount` devem vir exclusivamente de consulta autenticada ao horário oficial; parâmetros fornecidos pelo navegador não autorizam descontos. Ausência ou divergência bloqueia a proposta.
- A deduplicação das catracas precisa de **índice UNIQUE persistente** em `(school_id, device_id, external_event_id)`, além da deteção em memória. `previouslyProcessedKeys` é apenas uma entrada auxiliar para testes ou processamento em lotes; não garante concorrência nem substitui a restrição SQL.
- Eventos com relógio adiantado ou sincronização muito tardia permanecem em quarentena; o dispositivo não pode confirmar presença letiva. A libertação exige validação humana e auditoria.
- A aprovação do RH deve ser uma autorização persistida e vinculada ao fecho mensal específico; o booleano do motor é apenas dado interno de simulação e não deve ser aceite diretamente de pedidos do cliente.

## 9. Integridade das durações e eventos inválidos

- A folha mensal deve comparar **IDs, quantidade e duração oficial de cada aula** com uma versão imutável do horário publicado. `expectedLessonMinutes` e os restantes parâmetros de conferência devem ser gerados exclusivamente no servidor; dados recebidos do navegador nunca autorizam descontos.
- QR validado com timestamp inválido deve ficar `pending_review`, preservando IDs das evidências para auditoria; não deve interromper o apuramento de outros docentes ou originar desconto.
- A simulação atual **não prova** que um docente lecionou efetivamente; a presença QR é evidência administrativa e deve ser complementada por supervisão institucional, substituições, justificações e contestação. Qualquer desconto exige enquadramento jurídico/contratual e aprovação efetiva de RH na base de dados.

## 10. Integração real já existente no SIGA

- O portal `/professor/presenca` usa `TeacherAttendancePanel` e as server functions `createTeacherLessonQr` e `redeemTeacherLessonQr` em `src/features/hr/teacher-lessons.ts`. Os dados vivem em `public.hr_teacher_qr_sessions` e `public.hr_teacher_lesson_occurrences`, com a RPC `public.hr_redeem_teacher_qr`. A base Sga activa contém ambas as tabelas e as RPCs de resgate e assurance, mas estavam sem sessões QR e ocorrências no momento da consulta.
- O esquema `academic_evidence` criado no PR é um modelo de evidência separado e ainda não está ligado a esse fluxo real. Não implantar outro emissor QR nem migrar remuneração para ele sem uma estratégia explícita de transição, reconciliação de IDs, contratos e trilho de auditoria.
- Revisar a RPC do RH e as server functions existentes com foco em publicação do horário, idempotência, sessão expirada, autorização por escola/professor, aprovação pedagógica e efeitos na folha. Testes com duas conexões e fixtures do modelo real são obrigatórios antes de descontos.

## 11. Presença do professor na sala, sem depender do RH (2026-10-26)

- A 26/10/2026 a produção tinha 0 vínculos `hr_teacher_employment_links` e 0 `hr_contracts`: `hr_materialize_teacher_lessons` não criava nenhuma ocorrência e nenhum professor conseguia usar o QR. O QR fica como está (é evidência de remuneração).
- A presença na sala grava-se na própria aula do horário, `siga_attendance_sessions` (migração `20261026083707_teacher_lesson_presence.sql`, pacote `docs/agents/SIGA_aplicar_presenca_professor.sql`): `teacher_checked_in_at`, `teacher_checkin_method` (`portal`, `call`, `qr`, `manual`), `teacher_late_minutes`, `teacher_checked_out_at`, `teacher_presence_note`.
- Regras (`src/features/pedagogica/teacher-presence.ts`): o professor da aula confirma «Estou na sala» no dia, de 15 min antes do início até ao fim; até 5 min depois do início conta como a horas. Concluir a chamada no dia confirma também (`call`), excepto envios offline que chegam depois. O QR do RH marca a aula (`qr`). A Direcção/Secretaria regista pelo professor com motivo (`manual`, sem atraso calculado). Só o servidor escreve (`confirmTeacherLessonPresence`).
- Ecrãs: portal do professor, `/professor/presenca` («Aulas de hoje»), cabeçalho da chamada e Pedagógica → Presenças (estado por aula, nome do professor e contagem do dia). «Hoje na escola» conta professores com presença pelas aulas e pelo QR.
- Não tem efeito salarial nem gera faltas de RH. Sem o SQL aplicado, a chamada funciona como antes e os botões não aparecem.

## 12. QR único da escola para a presença dos professores (2026-10-26)

Pedido do proprietário: o director gera um QR, o mesmo para todos os professores, e cada
professor lê-o no telemóvel antes da aula e da chamada; tem de poder desligar-se e funcionar
sem rede em zonas remotas. Objectivo: travar quem marca aulas sem ir à escola.

- **Modo por escola** (`siga_school_presence_settings.mode`): `qr` (só conta a leitura do QR; o
  «Estou na sala» do professor é recusado no servidor e no ecrã vira «Ler QR da escola»),
  `button` (por omissão; a chamada concluída também confirma) e `off` (ninguém regista). A
  Direcção/Secretaria continua a poder registar com motivo, excepto em `off`.
- **QR rotativo** `SIGAP1.<escola>.R.<passo>.<mac>`: passo = unix/30 s, mac = HMAC da chave do
  dia (derivada do segredo da escola). O ecrã da Direcção recebe as chaves de hoje e amanhã e
  gera o QR sozinho, por isso funciona sem internet o dia todo. Uma fotografia enviada com
  rede minutos depois é recusada (`qr_expirado`).
- **QR impresso** `…P.<AAAAMMDD da segunda-feira>…` para escolas sem ecrã: vale a semana,
  exige localização dentro da zona; sem zona definida fica sempre por rever.
- **Zona GPS** (centro + raio, definida pela Direcção no pátio). Fora da zona, localização
  simulada (Android), imprecisa (> 500 m) ou em falta: a leitura fica **por rever**, não conta
  sozinha. Guarda-se só a distância e a precisão, não as coordenadas.
- **Sem rede**: o telemóvel guarda a leitura com a hora dele; no envio manda também a hora
  actual, e o servidor corrige o desvio (mudar a hora do telemóvel não engana) e prende a hora
  à janela do QR. Prazo da escola, 72 h por omissão.
- **Aulas confirmadas**: as do professor abertas na hora da leitura (de 15 min antes do início
  até ao fim), com o método `qr` e os minutos de atraso.
- **Revisão**: `/pedagogica_/presenca-docente` lista as leituras do dia; confirmar ou recusar
  exige motivo, e confirmar marca as aulas guardadas na leitura com a hora do QR.
- **«Anular todos os QR»** roda o segredo (versão + 1): ecrãs e folhas impressas deixam de valer.
- Web do professor: `/professor/presenca#ler-qr` (câmara com BarcodeDetector ou jsQR, fila em
  localStorage). App Flutter: «Presença na sala», via `/api/mobile/presence`.
- SQL: `20261026100000_school_presence_qr.sql`, aplicado na produção a 26/10 pelo proprietário.
