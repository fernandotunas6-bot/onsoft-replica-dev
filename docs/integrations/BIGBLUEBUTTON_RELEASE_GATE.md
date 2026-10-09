# BigBlueButton — revisão de segurança antes da ligação real

## Implementado nesta PR
- Adaptador BBB no servidor, com assinatura de pedidos.
- Política de autorização por escola, perfil e estado de aula.
- Controlos React reutilizáveis.
- Testes unitários de isolamento entre escolas e autorização (não executados neste ambiente).
- Mapeamento das tabelas reais de escolas, professores, turmas, matrículas e papéis.

## Portas de qualidade para desbloquear produção
- [ ] Validar, através de testes reais, as funções `bbbSignedUrl` e `createBbbMeeting` contra a versão BBB instalada.
- [ ] Validar se os caminhos `@/components/ui/button` e `lucide-react` estão disponíveis no build.
- [ ] Auditar como o SIGA liga `students` a utilizadores autenticados antes de permitir alunos nas reuniões.
- [ ] Integrar `school_memberships`, `member_roles`, `roles`, `teachers`, `class_subjects` e `enrollments` via consultas seguras.
- [ ] Criar schema com RLS e migração aprovada, sem alterar produção antes dos testes.
- [ ] Criar endpoints server-side com validação de sessão, idempotência e verificação de tenant.
- [ ] Nunca guardar passwords de moderador ou tokens assinados em colunas expostas ao cliente.
- [ ] Nunca mostrar gravações sem publicação explícita e validação da turma.
- [ ] Testar dispositivos reais, falhas de rede e reuniões simultâneas.

## Estado
Esta PR continua draft. Os componentes não estão montados nas páginas existentes. Não há servidor BBB instalado nem migração aplicada. Não fazer merge nem deploy automático.

## Revisão incremental — 09/10/2026
- A PR inclui uma Edge Function autenticada com as operações `list`, `schedule` e `capabilities`; a descrição original da PR está desactualizada.
- `start`, `join`, `end` e `recordings` continuam explicitamente indisponíveis (HTTP 501); não anunciar aulas ao vivo como funcionais.
- A política de autorização passou a distinguir `teachers.id` de `teachers.user_id`. Quem construir o contexto `ClassroomAuthorization` deve obter `teacherAssignment.teacherId` de `teachers.id`, `teacherAssignment.teacherUserId` de `teachers.user_id`, e comprovar `class_subjects` activo para a turma e escola.
- Testes de regressão adicionados para professor, aluno, isolamento entre escolas e publicação de gravações. **Ainda não existe confirmação de execução do CI para estes commits.**
- Antes de activar operações BBB, impedir que o cliente escolha `classGroupId`, `meetingId`, nome, papéis ou credenciais como factos de autorização; derivar a turma e reunião da sessão consultada no servidor.
- As credenciais BBB devem ser configuradas apenas no runtime que efectivamente chama a API BBB, com rotação e sem registo em logs ou resposta HTTP.
- Validar concorrência e transições atómicas `scheduled → live → ended`, incluindo repetição de pedidos e falha da API BBB.
- Actualizar o texto da PR, obter revisão de segurança, executar testes e ensaio em staging antes de remover o estado draft.
