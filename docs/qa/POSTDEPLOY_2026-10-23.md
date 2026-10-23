# SIGA Plus — auditoria pós-publicação (23/10/2026)

## Publicação auditada
- Commit de produção: `03a1fb85936dfd0f14cd235650c9ee75c48a00bc` (PR #244).
- Workflow de deploy: [GitHub Actions #39905877476](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/39905877476) — `success`.
- A correcção de segurança DOMPurify 3.4.17 foi integrada antes desse commit (PR #247).

## Verificação pública de leitura — concluída

Fonte: [GitHub Actions #39907167165](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/39907167165), executado em 23/10/2026 às 05:41 UTC.

| Verificação | HTTP observado | Resultado |
| --- | --- | --- |
| SIGA, página inicial | 200 | OK |
| WEB, página inicial | 200 | OK |
| WEB, /start | 200 | OK |
| Documentação | 200 | OK |
| ADMIN, entrada pública | 302 | OK |
| Payflow, /api/v1/health | 200 | OK |
| SIGA, /api/saas/plans | 200 | OK |
| SIGA, /api/saas/me sem sessão | 401 | OK |
| SIGA, /api/saas/stats sem sessão | 401 | OK |
| SIGA, /api/saas/domains sem sessão | 401 | OK |
| SIGA, /api/saas/subscriptions sem sessão | 401 | OK |

**Total:** 11/11 verificações HTTP aprovadas, 0 falhas; 6/6 testes Node da ferramenta aprovados. Não se enviou corpo, cookie, token ou credenciais; os redireccionamentos não foram seguidos nem os corpos lidos. Estes resultados provam a disponibilidade e a recusa anónima dos endpoints enumerados; não provam isolamento entre escolas em sessões reais, nem ausência de regressões visuais em todos os módulos.

## Homologação autenticada em staging — pendente

Utilizar exclusivamente **staging** e dados sintéticos, com sessões explicitamente autorizadas. O ensaio `tests/e2e/responsive-auth.spec.ts` já exige um servidor local ligado a Supabase de staging e recusa o projecto de produção. Não gravar estados de autenticação, capturas ou dados de alunos no Git.

| Perfil | Verificação funcional | Resultado |
| --- | --- | --- |
| Administrador | Autenticação/MFA; escolha da escola; sidebar contextual; permissões e troca de turma/ano; formulários longos | Pendente |
| Professor | Turmas e horários atribuídos; tarefas, chamada e notas; respeito por períodos encerrados | Pendente |
| Aluno | Apenas as suas notas, frequência, ficheiros autorizados, propinas e documentos | Pendente |
| Encarregado | Apenas os educandos vinculados e respectivas vistas autorizadas | Pendente |
| Duas escolas | Troca de escola não retém dados de outra instituição; URL/IDs cruzados são recusados pelo servidor | Pendente |
| Financeiro e documentos | Emissão de documentos de teste, assinatura/QR, recibos/propinas sem operações reais | Pendente |

**Matriz de ecrãs:** 320/390/768/1024/1440 px, teclado, movimento reduzido, tema claro/escuro, zoom, pesquisa IME, menu aberto/recolhido e foco visível. Registar aprovações e falhas sem capturas contendo dados pessoais. Autorização por interface não substitui RLS nem verificação de servidor.

## Próxima integração

A PR #248 acrescenta a auditoria pública automática `workflow_run` após cada **Deploy produção** bem-sucedido, mais testes estruturais de navegação por perfil. Rever lint, tipos, Vitest, build e o último resultado HTTP antes do merge. A automatização executa **somente GET** com URLs de produção fixos e sem credenciais. Não executa migrações, gravações, matrículas, pagamentos ou pedidos administrativos de alteração.
