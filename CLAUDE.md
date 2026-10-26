# Claude Code — instruções de execução SIGA Plus

> **Primeiro ler `AGENTS.md` integralmente.** Este ficheiro complementa, não substitui, as regras de arquitectura, segurança, base de dados, Lovable, desempenho e visual nele definidas.

## Plano de execução activo (26/10/2026)
- **Plano mestre e cartões por agente:** [docs/agents/CLAUDE_WORKSTREAM_PLAN_2026-10-26.md](docs/agents/CLAUDE_WORKSTREAM_PLAN_2026-10-26.md)
- **Estado de execução / handoff:** [docs/agents/CLAUDE_WORKSTREAM_STATUS_2026-10-26.md](docs/agents/CLAUDE_WORKSTREAM_STATUS_2026-10-26.md)
- **Estado técnico do projecto:** [docs/agents/CONTINUE.md](docs/agents/CONTINUE.md)
- **Contrato visual obrigatório:** [docs/design/VISUAL_MASTER_2026.md](docs/design/VISUAL_MASTER_2026.md)

**Ao abrir uma nova sessão:** actuar primeiro como **C0 / Coordenador**. Confirmar GitHub, SHA/base das PRs, worktrees e alterações ainda não submetidas. Executar **apenas A0** do plano; actualizar o handoff antes de atribuir tarefas. Não iniciar automaticamente todas as frentes.

**Princípios permanentes**
1. Continuar a partir das PRs existentes; não duplicar funcionalidades. Actualmente #332 contém Context Engine, #337 depende da #332, #340 trata presença dos professores e #341 engloba alterações da #339; reconfirmar sempre.
2. No máximo dois agentes com edição de código simultânea e propriedade de ficheiros disjunta; revisão sem edição em paralelo é permitida.
3. Um agente = tarefa curta + branch/worktree apropriada + testes + resumo e commit rastreável. Não editar `main` sem revisão.
4. Preservar interface e regras do SIGA Plus, incluindo UI contextual, acessibilidade, Supabase, RLS, RBAC, MFA e isolamento multi-tenant.
5. Não fazer force-push, alterações destrutivas, deploy ou migrações em produção sem autorização expressa.
6. Reduzir consumo de contexto: buscas específicas; resumo compacto; ler apenas os ficheiros do cartão atribuído; não repetir auditoria global.
7. Comunicar **VALIDADO**, **PARCIAL**, **BLOQUEADO** ou **NÃO INICIADO**, sem declarar validação de navegador/contas reais que não ocorreu.

**Instrução inicial:** “Lê `AGENTS.md`, `docs/agents/CLAUDE_WORKSTREAM_PLAN_2026-10-26.md` e o ficheiro de status. Executa só A0 e devolve o plano imediato com evidências; não edites funcionalidades ainda.”
