# Contrato de integração proposto — não activo

O entrypoint não instancia ApiGateway. `App` aceita uma implementação `Gateway` por injecção. API HTTP proposta na mesma origem, por omissão `/api/mobile-v4`. Estes endpoints não foram confirmados nem criados no SIGA.

| Endpoint proposto                                        | Resultado                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET `/session`                                           | `Session` ou null; identidade autenticada, memberships activos, roles e grants por escola |
| GET `/schools/:schoolId/workspace?role=professor\|aluno` | `Workspace` já filtrado no servidor por utilizador e escola                               |
| POST `/schools/:schoolId/commands`                       | `{role, command, requestId}`; confirmação só após transacção/auditoria                    |
| POST `/logout`                                           | Revogar sessão e limpar cookies conforme auth existente                                   |

Tipos completos em `src/domain/model.ts`. `schoolId` é selecção de contexto, nunca prova de autorização. `role` apenas solicita um papel que o servidor já autorizou; `userId` não é enviado como identidade para mutações. O cookie/sessão autenticada define a identidade.

## Reutilização obrigatória

- `getCurrentAccountContext`, `AuthGate`, memberships e MFA existentes. Não implementar nova base de contas ou password no mobile.
- Guards reais de leitura/escrita do SIGA, incluindo grants `Nenhum` e `Leitura`. Aluno exige guard próprio restrito à matrícula, não o guard de staff.
- `class_subjects.teacher_id`, matrículas activas e autorização de disciplina/turma. Nunca aceitar matrícula, turma ou professor apenas porque veio do browser.
- Horários existentes e política canónica de presenças (incluindo presença docente QR, que não está implementada nesta versão).
- AssessmentCenter e schemas de notas actuais: 0–20 é validação mínima, não regra completa de avaliação.
- Serviço de tarefas/ficheiros/mensagens/documentos vigente, com publicação, audiência e direitos de acesso.
- Não importar componentes visuais do SIGA: esta pasta conserva o primeiro modelo visual solicitado.

## Escritas

Servidor deriva actor/user e escola autorizada, valida sessão/MFA/grants, confirma relações dos IDs, rejeita período fechado e revogação, valida payload, impede repetição por requestId, regista auditoria e devolve conflito em revision desactualizada. O cliente fornece expectedRevision nas notas. Attendance, task, submission, plan, message e document são comandos separados; aplicar apenas a operação permitida.

CSRF: validar Origin/Referer, exigir JSON e cookies seguros SameSite conforme arquitectura de auth; não aceitar POST de origem arbitrária. Não pôr tokens em URL/localStorage nem service-role no browser. Servidor deve usar Cache-Control: no-store para sessão e dados privados.

O mock valida escola, utilizador, role, grant, atribuição docente, matrícula, nota, período, revisão, prazo e destinatário. Estes testes não provam RLS ou segurança dos endpoints reais. O client refiltra resultados para defesa adicional; dados não autorizados nunca devem chegar ao browser.

## Erros e estados

- 401: limpar contexto e pedir nova autenticação; não trocar silenciosamente para demo.
- 403: limpar dados do contexto e apresentar acesso indisponível.
- 409: revalidar antes de nova escrita; não sobrescrever alterações alheias.
- 422: erro de validação contextual sem revelar dados de outras escolas.
- Rede: reabrir/revalidar; sem confirmação de escrita offline.

Ao trocar escola ou papel: limpar dados/formulários/listas visíveis, abortar a leitura anterior e ignorar respostas tardias. Após escrita: reconsultar servidor antes de confirmar vista. Ao terminar sessão: limpar memória e dados privados. A PWA só precacheia o shell.

## Gates para staging

Dois tenants, conta sem vínculo, aluno próprio/outro, docente atribuído/não atribuído, grants read/none, sessão expirada, MFA, período fechado, IDs adulterados, notas não publicadas, auditoria, pedido de documento e troca de contexto durante leitura/escrita. Não executar SQL ou tocar produção para validar esta pasta.

## Mapa de aulas e chat — extensão das referências

`teacherAttendance` é uma lista separada `{lessonId,userId,status}` de registos docentes. Não calcular a presença do professor a partir da chamada dos alunos. Sem registo: pendente; nunca converter automaticamente em falta. Datas/métricas do mapa respeitam Africa/Luanda, e um dia com resultados diferentes fica «Registos mistos». Totais contam aulas, não quadrados. A história de teste só é criada no modo demonstrativo escolhido explicitamente.

`src/services/chat-import.ts` recebe uma projecção de conversas directas autorizadas do SIGA em `sigaDirectThreads`: `{schoolId,memberIds,messages:[{id,sender_id,body,created_at,deleted_at}]}`. É baseada em `src/features/messages/chat-server.ts` e na sua `MessageRow`, consultados nesta implementação. O cliente verifica escola/participantes, omite mensagens eliminadas, deduplica e converte para os balões do chat. `ApiGateway` aplica o conversor quando esse campo está presente na resposta. Não copia dados directamente da base de produção nem importa o UI StaffMessenger.

Servidor deve reutilizar `assertMember`, `assertConversationOpen`, `loadSchoolColleagues` e as regras de contacto actuais. O feed já precisa de autorização antes de chegar ao cliente. A UI desta pasta ainda limita contactos à relação docente/aluno nas turmas; grupos, anexos, respostas a mensagens e confirmações de leitura do chat principal não foram integrados. Nenhuma mensagem real foi importada, porque a autenticação/API continuam desactivadas.
