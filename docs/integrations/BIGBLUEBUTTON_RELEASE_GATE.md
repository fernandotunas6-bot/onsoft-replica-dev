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

## Preparação do deploy isolado — 09/10/2026

### Destino e segurança
- **Produção SIGA Plus (projecto `xodgfmxiaunpamctfeea`) é proibida como destino de staging**. Não executar migrações, Edge Functions ou configuração BBB neste projecto.
- A criação de `SIGA Plus BBB Staging` foi recusada pelo Supabase: limite de dois projectos gratuitos activos.
- A restauração do projecto secundário `rzqglamkxkcobxjmshic` também foi recusada pelo mesmo limite. A base de dados secundária não foi auditada; não assumir que está vazia.
- Necessário disponibilizar um projecto Supabase novo e isolado, ou resolver o limite de capacidade sem alterar produção.

### Verificações do GitHub
- No commit `32eb02c81246b1acf5e8375a7735c61025abac65`, os workflows CI, Academic Import Check e BBB formatting verification foram reportados como `action_required`; nenhuma execução de testes aprovada foi comprovada.
- Verificar permissões e aprovações do GitHub Actions antes de considerar CI validado.

### Procedimento quando o staging estiver disponível
1. Confirmar o identificador do projecto de staging e a ausência de dados de terceiros; nunca reutilizar credenciais de produção.
2. Rever e aplicar a migração `20261008170000_bbb_classroom_metadata.sql` apenas no staging; verificar RLS, FKs e políticas.
3. Configurar variáveis Supabase próprias do staging e publicar `bbb-classroom` com JWT obrigatório.
4. Validar autenticação, isolamento entre escolas, listagem, agendamento, permissões e respostas 501 para funcionalidades desactivadas.
5. Configurar um servidor BBB independente com HTTPS e credenciais exclusivamente server-side, implementar e testar operações de reunião antes de as activar.
6. Executar CI, testes de integração, smoke tests, concorrência e dispositivos reais; manter a PR draft até aprovação.

**Estado efectivo:** staging não provisionado; deploy não executado; produção preservada. Não anunciar a videoconferência como operacional.
