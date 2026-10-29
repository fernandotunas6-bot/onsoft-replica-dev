# SIGA Plus — menus de linha e acções em lote (29/10/2026)

## Decisão

Complemento da PR #391, em PR empilhada. Não substituir
a estrutura do SIGA, não criar endpoints duplicados de cobrança,
notas ou eliminação, não expor outras escolas nem enviar mensagens sem confirmação.

## Contas (Gestão de Acessos)

- Menu de três pontos por conta: ver perfil de acesso, recuperação de senha por
  e-mail, ligação de recuperação (Administrador), nova senha directa
  (Administrador, MFA e guardas antigos), impressão de credenciais,
  bloquear/reactivar e remover acesso à escola.
- **Remover não é apagar**: usa `setSystemAccountDisabled` na escola activa.
  `auth.users`, perfis, pessoas e históricos são preservados. Não conceder
  capacidade de eliminar fisicamente com o cliente administrativo.
- Selecção múltipla: copiar, CSV, preparar e-mail em BCC e suspender até 25
  contas por lote com confirmação, relatório de falhas e auditoria por conta.
- Se o administrador é membro de várias escolas, a operação não deve
  bloquear identidades noutras escolas. O servidor existente decide a acção.
- A selecção é limpa ao mudar a escola activa. O e-mail é apenas um rascunho
  `mailto:`, não confirmação de envio.

## Alunos

- Menu da linha na tabela: perfil, financeiro, académico, documentos, gestão
  de acessos, cópia, resumo PDF e e-mail.
- A Action Sheet do telemóvel expõe atalhos equivalentes.
- Selecção múltipla: copiar números, CSV, agrupar por turma em CSV, imprimir
  PDF, preparar mensagem em BCC (máximo de 20 destinatários), exportar devedores,
  e abrir o lançamento de notas.
- A selecção *não* é passada ao livro de notas. Notas só se escrevem na
  grelha, por turma/disciplina/trimestre, após validação pedagógica.
- A lista de devedores é apenas preparação. Cobranças reais e recibos
  continuam no financeiro, sujeitos a autorização e confirmação no servidor.
- Conservar `batchAssignClass` e `batchUpdateStudentStatus` já existentes.
  O menu novo não os substitui e não cria duplicações de matrícula.
- O selector de todos usa somente a página corrente e a selecção é limpa
  quando se muda de escola ou de ano lectivo.

## Validação

1. Correr lint, typecheck, build e testes de UI/segurança.
2. Ensaiar conta Admin, Secretaria e Professor em duas escolas.
3. Confirmar que um utilizador não altera uma conta própria ou outra escola.
4. Recuperar senha por e-mail com Resend; sem SMTP, mostrar falha real.
5. Confirmar que reactivação restaura acesso sem apagar registos.
6. Verificar XLS/CSV/PDF e mensagens em Android e iPhone, sem revelar os
   destinatários uns aos outros.
7. Verificar notas/propinas: as acções de atalho não devem criar dados
   financeiros ou académicos por acidente.
8. **Não fundir nem publicar** sem CI e QA real; dependência conhecida
   de auditoria em `re2js` continua pendente no repositório.

## Extensões futuras (não fingir que existem)

- Listas de distribuição persistentes com associação de alunos, regras de
  confidencialidade e expiração, após definição de esquema/RLS/consentimento.
- Cobranças por lote reais com confirmação individual de fatura e
  reconciliação idempotente.
- Lançamento de notas em lote com validação professor-disciplina-turma,
  avaliação e trimestre.
- Bloqueio de credenciais de aluno (distinto do estado académico), com
  endpoint específico autorizado e auditoria.
