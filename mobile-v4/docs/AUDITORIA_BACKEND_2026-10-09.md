# Auditoria inicial de integração — 09/10/2026

## Ficheiros efectivamente consultados

- `src/features/messages/chat-server.ts`: usa `createServerFn`, `requireSupabaseAuth`, `loadSgaAdminClient`, `resolveSgaMembershipAdmin`; inclui `assertMember` e `assertConversationOpen` para isolamento de conversas.
- `mobile-v4/src/services/api.ts`: `ApiGateway` proposto para rotas same-origin; verifica contexto local e faz pedidos sem cache.
- `mobile-v4/src/main.tsx`: actualmente instancia `App` sem gateway institucional; a integração está deliberadamente desligada.
- `mobile-v4/src/domain/model.ts`: contratos `Session`, `Membership`, `Context`, `Workspace` e `Command`.
- `mobile-v4/docs/INTEGRACAO.md`: requisitos de MFA, RLS, atribuições e auditoria.

## Decisões

1. Não activar `ApiGateway` na versão publicada antes de existirem rotas testadas.
2. Implementar adaptador servidor seguindo o padrão TanStack React Start e middleware Supabase já existentes, sem duplicar autenticação.
3. Nunca confiar no `userId`, `role` ou `schoolId` recebidos do cliente como autorização; resolver identidade da sessão e vínculo activo no servidor.
4. Reutilizar guardas do chat para leitura/escrita, incluindo membros activos e escola da conversa; evitar acesso directo a tabelas de mensagens no cliente.
5. A integração entre origens exige uma estratégia de cookies/sessão: preferir mesma origem institucional, e não tentar ler cookies de `portal-siga.com` a partir de `pages.dev`.

## Próxima implementação (ainda pendente)

- Identificar a rota e o middleware exactos do servidor React Start para expor `/api/mobile-v4/session` e restantes endpoints.
- Implementar GET sessão com vínculos activos e grants derivados do servidor.
- Implementar GET workspace com projecção filtrada por escola e papel; nunca expor notas não publicadas ao aluno.
- Implementar POST commands com transacções, controlo de revisão e auditoria; proibir comandos sem permissão.
- Implementar logout no servidor e validação de CSRF.
- Testar 401/403/409/422, duas escolas, professor não atribuído, aluno não matriculado e MFA pendente.

**Não foi feita migração, alteração de autenticação, activação de API ou deploy.**
