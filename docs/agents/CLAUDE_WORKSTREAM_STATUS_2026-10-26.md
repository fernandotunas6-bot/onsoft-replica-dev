# Handoff e estado dos agentes Claude — SIGA Plus
**Criado:** 26/10/2026 · **Actualização efectiva dos agentes:** pendente · **Documento de execução:** [CLAUDE_WORKSTREAM_PLAN_2026-10-26.md](CLAUDE_WORKSTREAM_PLAN_2026-10-26.md)

> Este é o estado **da execução deste plano**, não uma afirmação de que funcionalidades das PRs já não existem. Nenhuma validação de código, navegador, produção ou CI foi executada por este documento. Confirmar sempre o SHA das PRs.

## Quadro vivo de tarefas
| Cartão | Agente | Estado de execução do plano | Dependência | Resultado esperado |
| --- | --- | --- | --- | --- |
| A0 | C0 · Coordenador | NÃO INICIADO | nenhuma | Inventário Git/PRs, ownership e bloqueios com evidência |
| A1 | Context Engine | AGUARDA A0 | A0 | Rever/validar contratos e motor da #332 |
| A2 | Navegação contextual | AGUARDA A1 | A1 | Sidebar e mobile sem duplicar #332/#333 |
| A3 | Páginas de entidade | AGUARDA A2 | A1, A2 | Completar/validar contextos da #332 e #337 |
| A4 | Performance | AGUARDA A3 | A3 | Medições antes/depois, sem regressão |
| A5 | QA e segurança | AGUARDA A4 | A1–A4 | Matriz de acessos, dispositivos, testes e falhas |
| B1 | Presença professores | AGUARDA INVENTÁRIO | A0 (ownership) | Revisão isolada da #340, migração e antifraude |
| C1 | Login/turmas | AGUARDA INVENTÁRIO | A0 (ownership) | Revisão isolada da #341 (inclui #339) |
| C2 | Integração de PRs | AGUARDA QA | testes por frente | CI, conflitos, sequência, aprovações |

**PRs de referência em 26/10/2026:** #332 (aberta), #333 (integrada na #332), #337 (aberta e dependente da #332), #340 (aberta), #341 (aberta e inclui #339), #339 (aberta). O coordenador deve actualizar após consulta real.

## Registo operacional obrigatório (actualizar ao terminar cada cartão)
```text
Data/horário:
Cartão:
Agente:
Branch/worktree:
Base SHA / HEAD SHA:
Ficheiros exclusivos atribuídos:
PR(s)/issues relacionadas:
O que já existia:
Alterações feitas (sem repetir trabalho):
Testes/comandos e resultados:
Segurança/RBAC/MFA/RLS/escola activa:
Testes navegador/mobile/contas reais (REALIZADO/BLOQUEADO):
Conflitos e riscos:
Estado (VALIDADO/PARCIAL/BLOQUEADO):
Commit(s):
PR de entrega:
Próxima acção pequena:
```

## Matriz de ownership — preencher em A0
| Cartão | Caminhos concretos reservados | Dono activo? | Conflitos com outra PR? |
| --- | --- | --- | --- |
| A1 | confirmar em A0 | não | por verificar |
| A2 | confirmar em A0 | não | por verificar |
| A3 | confirmar em A0 | não | por verificar |
| A4 | confirmar em A0 | não | por verificar |
| A5 | testes, confirmar em A0 | não | por verificar |
| B1 | confirmar no diff da #340 | não | por verificar |
| C1 | confirmar no diff da #341 | não | por verificar |

## Bloqueios iniciais conhecidos pelas descrições das PRs (não testados neste plano)
- **#337:** depende da #332; reavaliar base da PR após integrar #332.
- **#340:** descreve migração `supabase/migrations/20261026090000_teacher_lesson_presence.sql` por aplicar e necessidade de teste autenticado no navegador; conflito possível com `src/routeTree.gen.ts`.
- **#341:** descreve contas de alunos e organização de turmas, mas não validação com contas reais; inclui #339.
- **Context Engine:** não assumir que o que está no branch da #332 está já em `main`.

## Comando de arranque
```text
Claude, lê AGENTS.md, CLAUDE.md, o plano e este quadro.
Actua apenas como C0 e executa A0 em modo inventário. Reconfirma PRs,
sha/base, CI e worktrees; completa ownership e enumera lacunas sem reescrever
funcionalidades. Actualiza este ficheiro com a evidência encontrada.
Escolhe uma só próxima tarefa desbloqueada. Não lances outros agentes agora.
```
