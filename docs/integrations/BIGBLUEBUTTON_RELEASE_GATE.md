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
