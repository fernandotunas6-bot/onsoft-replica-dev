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
