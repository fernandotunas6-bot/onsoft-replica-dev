---
name: siga-alunos-ano-lectivo
description: >-
  Skill transversal do SIGA Plus para login de alunos por número/BI,
  cadastro permanente de Pessoas, organização de turmas A-Z por idade,
  matrícula, rematrícula e rollover de ano lectivo. Usar quando qualquer
  dessas funções, listas, portal de aluno ou navegação contextual for editada.
---

# SIGA Plus — Aluno, acesso, turma e ano lectivo

**Skill de execução da PR #339.** Não é um novo módulo de produção, um novo Auth, nem substitui as skills existentes.

## 0. Ordem de leitura obrigatória

1. `AGENTS.md`, `docs/agents/CONTINUE.md` e `docs/agents/DATABASE_RULES.md`.
2. `docs/design/VISUAL_MASTER_2026.md` e `docs/design/SIGA_VISUAL_MASTER_2026-10-23.md`. Estes dois contratos são a fonte visual superior e não devem ser copiados parcialmente nem contraditos.
3. `docs/specs/SIGA_STUDENT_LOGIN_AGE_CLASSES_ROLLOVER_2026-10-26.md` (investigação + arquitectura).
4. [Prompt Master executável](references/PROMPT_MASTER.md), na íntegra.
5. [Estrutura visual por contexto](../../../docs/design/STUDENT_LOGIN_CLASSES_CONTEXTUAL_UI_2026-10-26.md).
6. Skills de domínio: `siga-alunos`, `siga-pessoas`, `siga-pedagogica`, `siga-matricula`, `siga-acessos`, `siga-performance`. Nunca sobrepor as políticas específicas de cada módulo.

## 1. Fontes reais do código (inspeccionar primeiro)

| Domínio | Fonte real |
| --- | --- |
| Entrada, MFA, captcha | `src/components/auth/AuthGate.tsx`, `src/features/access/server.ts`, `src/features/access/{bi-login,bi-identity,student-number-login}.ts` |
| Conta/sessão e permissões | `src/features/auth/{server,access-policy,portal-engine}.ts`, `src/features/auth/use-current-account.ts` |
| Pessoas | `src/features/people/{server,schemas,bi-document}.ts`; `src/routes/pessoas/index.tsx` |
| Alunos e listas | `src/features/students/{server,enrollment-core,current-enrollment}.ts`, `src/routes/alunos/` |
| Ano/renovação | `src/features/academic/year-rollover{,-server}.ts`; `src/routes/pedagogica_.turmas.$turmaId_.renovar.tsx` |
| Planeador por idade | `src/features/academic/class-age-allocation.ts` (**simulação; não publica**) |
| Sidebar/contexto | `src/features/auth/contextual-navigation.ts`, `src/features/intelligence/`, `src/components/layout/{AppShell,AppSidebar,PageHeader}.tsx` |
| Contratos visuais | `src/lib/appearance.tsx`, `src/styles.css`, `src/lib/app-icons.ts` |

Os ficheiros podem evoluir; confirmar branch, diff, esquema real e PRs concorrentes antes de alterar.

## 2. Invariantes irrenunciáveis

- Uma pessoa tem cadastro estável; `people` é **school-scoped** no esquema actual. Não declarar identidade global real entre escolas sem migração autorizada.
- Um aluno conserva `student_number` dentro da escola; matrícula, turma e ano são vínculos temporais separados. **Nunca renumerar no fecho anual**.
- O ano fechado retém resultados, pauta, presenças, contratos, facturas, recibos, histórico e documentos. Não alterar o passado para criar o novo ano.
- Turma A recebe os mais novos somente quando a política específica da escola estiver activada; não presumir que a regra é lei angolana. A idade não sobrepõe requisitos pedagógicos/legais.
- A simulação por idade é pura, determinística e confinada a escola + ano + classe + curso + turno; alterações reais exigem **transacção servidor/BD**, revalidação de vagas, revisão humana e registo auditável.
- Login por BI/ID nunca converte dados digitados no cadastro directamente numa identidade Auth. A senha pertence ao Supabase Auth, nunca ao cadastro.
- Erros de login não enumeram contas; números escolares repetem-se entre escolas; usar o domínio/identidade de escola para resolver ambiguidades sem revelar e-mails.
- Autorização não é UI: RLS + guards do servidor + escola activa, AAL2 nas operações críticas e auditoria; nunca `school_id` livre recebido do browser.
- **Uma página = uma função principal**; nada de sidebar paralela ou páginas com acções de módulos estranhos. Uma operação longa é uma página; confirmação curta pode usar modal já existente.
- Reutilizar Inter, tokens de tema, ícones canónicos, perfis, preferências da escola e animação institucional. Sem vídeo novo de arranque, gradientes pesados ou excesso de cartões.
- Não fazer force-push/rebase de commits publicados; Lovable sincroniza a branch; nunca tocar em SQL de produção por esta skill.

## 3. Sequência de implementação recomendada

1. **Diagnóstico:** mapear contas sem vínculo, números, BI, matrículas correntes/futuras, alunos sem data de nascimento, regras de promoção e PRs em curso; relatório sem expor PII.
2. **Login:** testar `AuthGate` + funções existentes; resolver BI via `auth.users` ligado; manter ID por hostname e opção da escola, MFA/captcha, rate limit. Criar fluxo institucional para vincular contas legadas sem inventar credenciais.
3. **Listas e IDs:** usar `student_number` em listagens de turmas, renovação, relatórios e exportações, sem duplicar UUID ou colunas; respeitar papéis.
4. **Ano:** preservar `people`/`students`; nova matrícula por ano; aprovado/retido/concluído/transferido/incompleto antes da turma de destino.
5. **Turmas:** pré-visualizar planeamento etário com data validada e lotação por classe/curso/turno/ano; tratar faltas de dados, ocupações protegidas e excepções.
6. **Serviço de escrita:** introduzir apenas quando houver schema e RPC transaccional idempotente, lock de vagas, AAL2, auditoria, pré-visualização com versão e controlo de concorrência.
7. **Visual contextual:** integrar páginas/rotas no catálogo autorizado, breadcrumb e sidebar existentes. Nunca registar nova rota sem acesso por papel, link, testes e fallback mobile.
8. **Validação:** testes unitários, segurança cross-tenant, Playwright com alunos/secretaria em pelo menos duas escolas, largura 390/768/1024/1440, teclado, zoom e reduced-motion; comparar baseline.
9. **Entrega:** commits atómicos, CI completo, matriz de pendências, revisão; **sem merge/deploy/SQL** sem gates aprovados.

## 4. Testes mínimos e evidências

- `tests/access/bi-login-resolve.test.ts`, `tests/auth/bi-identity.test.ts`, `tests/access/student-number-login.test.ts`.
- `tests/academic/class-age-allocation.test.ts`, `tests/academic/year-rollover.test.ts`, `tests/academic/year-rollover-server.test.ts`.
- `tests/students/current-enrollment.test.ts`, `tests/students/enrollment-core.test.ts`.
- Controlo de autorização de `src/routes/alunos`, `/pessoas`, `/pedagogica`, `/portal`; compatibilidade do contexto quando #332 for integrado.
- Executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run check:security` e gates relevantes; preferir começar por testes dirigidos.
- Marcar cada componente da matriz como **por auditar / parcial / implementado / validado / bloqueado**, com evidência real. Testes mock não equivalem a login e RLS remotos.

## 5. Status da PR #339

Entregues: primeira simulação de turmas por idade, testes unitários, segurança inicial na resolução BI, mensagem de erro e número escolar na renovação. **Ainda não entregues:** nova página Pessoas > Preparar ano, botão funcional Organizar Turmas, RPC de aplicação, QA com escola real, reconciliação de contas legadas e publicação.

> Ao retomar, lê primeiro os relatórios do CI actual e resolve testes antigos incompatíveis **sem reintroduzir login inseguro baseado em e-mail editável de Pessoas**.
