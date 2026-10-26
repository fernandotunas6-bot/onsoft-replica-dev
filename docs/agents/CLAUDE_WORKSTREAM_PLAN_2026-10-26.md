# SIGA Plus — Plano de divisão e coordenação para Claude Code
**Data de referência:** 26/10/2026 · **Projecto:** `fernandotunas6-bot/onsoft-replica-dev` · **Estado inicial:** plano de execução; nenhuma implementação certificada por este documento.

> **MISSÃO**: continuar o código existente, com contexto mínimo suficiente, propriedade clara dos ficheiros, entregas verificáveis e PRs pequenas. Não reconstruir módulos já feitos, não aumentar a UI e nunca confundir testes locais com validação em produção.

## 0. Fontes obrigatórias antes de modificar código
1. `AGENTS.md` e `docs/agents/CONTINUE.md`.
2. `docs/agents/ARCHITECTURE_HARMONIZATION.md`; skills relevantes em `.cursor/skills/siga*/SKILL.md` (consultar apenas as que forem necessárias à tarefa).
3. Para UI: `docs/design/VISUAL_MASTER_2026.md` e `docs/design/SIGA_VISUAL_MASTER_2026-10-23.md`.
4. Para migração/dados: `docs/agents/DATABASE_RULES.md` e `supabase/PRODUCTION_SNAPSHOT.json`. **Nunca aplicar migrações sem autorização expressa e plano de rollback**.
5. Registar resultados e bloqueios em `docs/agents/CLAUDE_WORKSTREAM_STATUS_2026-10-26.md`.

### Inventário verificado no GitHub em 26/10/2026 (reconfirmar ao iniciar)
| PR | Estado nessa data | Relação e decisão de coordenação |
| --- | --- | --- |
| [#332](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/332) | aberta, base `main` | Motor de contexto, sidebar da entidade, aluno, turma, disciplina, faturas. **Trabalho primário A**; auditar antes de implementar. |
| [#333](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/333) | integrada no ramo da #332 | Menu de turma/disciplina; **não recriar e não assumir que já entrou no main**. |
| [#337](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/337) | aberta, base da #332 | Página e contexto de ficheiro; **PR empilhada**; só integrar após #332 e rever nova base. |
| [#340](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/340) | aberta, base `main` | Presença por aula/QR e chamada; necessita migração antes de validar a funcionalidade nova; **frente B**. |
| [#341](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/341) | aberta, base `main` | Contas de alunos, ID/BI, organização de turmas; inclui #339; **frente C separada**. |
| [#339](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/339) | aberta, base `main` | Parte já incluída em #341; não fundir as duas indiscriminadamente. |

As PRs existentes e as suas bases são a realidade operacional. Este plano **não presume** que estejam fundidas, verdes, testadas em navegador ou em produção. Verificar conflitos e CI pelo SHA mais recente.

## 1. Modelo de execução: coordenador + especialistas
- **Coordenador (C0, sem editar produto)**: inspeccionar `git status`, branch, worktrees, últimas PRs, CI e ficheiros de handoff; reservar ownership; atribuir só a próxima tarefa desbloqueada; consolidar relatórios concisos. Não lançar todas as fases simultaneamente.
- **Máximo de 2 agentes a editar código em paralelo** e **nunca os mesmos ficheiros**. Revisão/QA read-only pode acompanhar. A quota da conta é partilhada; mais agentes simultâneos não significam economia.
- Cada agente usa **branch/worktree própria**, excepto quando continua conscientemente uma PR já existente. Se a árvore contiver trabalho não guardado, parar alterações naquele checkout e preservar o estado, sem `reset --hard`, `clean -fd` ou `push --force`.
- Fazer **um commit pequeno por entrega validada**; a integração é por PR com CI e revisão, **sem merge automático para `main`**, sem deploy, migração ou alteração de segredos.
- Só ler ficheiros directamente relevantes; procurar por caminho/símbolo primeiro. Evitar colar árvores inteiras, logs extensos e PRs completas no contexto. Usar sumários e links de evidência.
- Quando uma fase já estiver feita na PR respectiva, marcar **VALIDAR**, não voltar a implementá-la.

## 2. Mapa das frentes e dependências

```text
C0 Coordenador (documentação/coordenação, sem edição de funcionalidades)
 ├─ Frente A · SIGA Context Engine (#332; #337 depende)
 │   A0 inventário + mapa dos ficheiros e PRs
 │    → A1 motor/contratos e validação multi-tenant
 │      → A2 sidebar, navegação e menu contextual
 │        → A3 páginas de entidades/contexto (#337 após #332)
 │          → A4 integração/performance
 │            → A5 QA de segurança, UX, mobile e regressão
 ├─ Frente B · Presença de professores (#340)
 │   B1 validar implementação existente, migração e provas antifraude
 └─ Frente C · Contas de alunos / turmas (#341; inclui #339)
     C1 revisão independente, login, primeiro acesso, rollover e listas
Todos → C2 integração controlada de PRs e handoff final
```

**Em paralelo:** B1 e A0/A1, ou C1 e A0/A1, desde que não editem ficheiros comuns; integrar sequencialmente quando houver conflitos. As fases A1–A3 do mesmo motor devem seguir contrato e ordem; não deixar dois agentes alterarem `src/features/intelligence/` ou `AppSidebar` ao mesmo tempo.

## 3. Cartões de trabalho executáveis

### A0 — Inventário técnico e prevenção de trabalho duplicado
**Responsável:** C0 · **Dependências:** nenhuma · **Tipo:** leitura/documentação.
- Confirmar SHA, head/base, CI, reviews, estado das PRs #332, #337, #340, #341, #339.
- Mapear ficheiros efectivamente alterados, migrações e conflitos reais. Verificar `git status`, remotes, worktrees e testes possíveis.
- Confirmar onde estão `ContextFrame`, `resolveContext`, `ContextModule`, `ContextEntityNav`, `ActiveContextProvider` e respectivos testes **sem assumir caminhos novos**.
- Produzir matriz de ownership por caminho real, lacunas com evidência e prioridades. **Não escrever código do produto.**
- **Aceite quando:** quadro de estado actualizado, riscos e pré-requisitos atribuídos, nenhuma tarefa duplicada aberta.

### A1 — Contratos e motor de contexto (rever a #332)
**Responsável:** engenheiro Context Engine · **Dependência:** A0 · **Ownership:** `src/features/intelligence/` (resolver conforme árvore real), testes do resolvedor/registry.
- Reutilizar o resolvedor, registry e módulos existentes; não criar segundo motor.
- Confirmar identidade do contexto: escola activa, papel, ano lectivo, rota, entidade autorizada, secção e chaves de cache com escopo do tenant.
- Recusar IDs de outra escola, entidade inexistente, rota inválida, permissão insuficiente e contexto memorizado revogado. A UI nunca amplia autorizações do servidor.
- **Aceite quando:** testes de resolução/negação/RBAC passam e nenhuma alteração ilegítima entre escolas é possível; contratos e API de UI documentados.
- **Não editar:** sidebar, rotas de entidade, SQL de presença, contas de alunos.

### A2 — Sidebar e navegação contextual (aproveitar #332/#333)
**Responsável:** engenheiro navegação · **Dependência:** A1 · **Ownership:** componentes existentes da sidebar, navegação e respectivos testes (ficheiros concretos confirmados em A0).
- Usar `ContextModule` e entradas do motor, sem menus duplicados. Contexto de turma/aluno/disciplina/professor/fatura/ficheiro conforme existência e acesso real.
- Voltar, breadcrumbs, item activo, escola seleccionada, mobile `Mais`, navegação por teclado, foco e histórico.
- Conservar o design SIGA: lado esquerdo recto, concavidade interna à direita quando prevista no contrato, hover lateral sem deslocamento, conteúdo principal limpo e modais pequenos apenas quando necessários.
- **Aceite quando:** testes de navegação/roles e capturas em 390, 768, 1024 e 1440 px, sem vazamento entre escolas nem menu irrelevante.
- **Não editar:** regras de presenças, migrações, contas de alunos.

### A3 — Conteúdo específico da entidade/página (aproveitar #332/#337)
**Responsável:** engenheiro páginas · **Dependências:** A1, A2; #337 depende da base #332 · **Ownership:** rotas/componentes de páginas explicitamente reservados em A0.
- Verificar: aluno e secções, turma, disciplina e trabalhos, professor, fatura, ficheiro, relações com dados efectivamente autorizados.
- Uma página = função e contexto; dados dependentes carregados sob demanda, sem colocar resumos de outros módulos no conteúdo principal.
- Para Arquivos, não revelar `storage_path`; usar autorização no servidor e o fluxo actual de assinatura/abertura.
- Não inventar serviços/rotas; identificar o que já existe e entregar somente lacunas verificadas.
- **Aceite quando:** URL directa, refresh, voltar, troca de escola, acesso negado e estado vazio funcionam, com testes por entidade.
- **Não editar:** motor partilhado, sidebar, SQL de presença.

### A4 — Integração e performance (sem refazer UI)
**Responsável:** engenheiro performance · **Dependência:** A3 · **Ownership:** optimizações estritamente identificadas por medição e testes de integração.
- Medir antes/depois: consultas duplicadas, renderizações, payload, cache invalidation, revalidação ao mudar escola/papel/ano e navegação.
- Reutilizar queries e componentes; não adicionar bibliotecas ou reescrever arquitectura sem justificativa.
- **Aceite quando:** relatório de medições reproduzível, sem regressão funcional, sem cache que exponha dados de outro tenant.
- **Não editar:** módulos não relacionados e regras de negócio.

### A5 — QA e segurança de ponta a ponta
**Responsável:** QA/auditor · **Dependências:** A1–A4 · **Ownership:** testes, scripts de QA e relatório; não editar produto enquanto houver outro editor no mesmo ficheiro.
- Testar conta autorizada/não autorizada, duas escolas, aluno, professor, secretaria, financeiro, direcção, troca de contexto e sessão expirada.
- Verificar mobile/desktop, navegação por teclado, contraste, sem scroll horizontal, tratamento de erro e rotas directas.
- Executar typecheck/lint/testes focados, depois CI completo conforme ambiente. Testes com contas reais **só em ambiente autorizado**.
- **Aceite quando:** matriz PASS/FAIL/BLOCKED com comandos, SHA e evidências; pendências não são declaradas resolvidas.

### B1 — Presença de professores e QR (continuar a #340)
**Responsável:** engenheiro presença · **Dependência:** inventário de B; **branch/PR independente**.
- Primeiro verificar o que a #340 já implementa: confirmação por aula, chamada, janela temporal, atraso, métodos QR/manual, migração pendente `20261026090000_teacher_lesson_presence.sql`, permissões e conflitos.
- Diferenciar **QR do RH existente**, confirmação da aula e **proposta de QR único da direcção**; a última NÃO está aprovada como mudança de produção por este documento.
- Se a direcção vier a gerar um QR comum para professores, evitar QR estático partilhável: token de curta validade/rotativo assinado ou nonce validado pelo servidor; identidade por login do professor; escola activa; horário/turma/disciplina autorizados; idempotência; antifraude e auditoria; tratamento de offline/rede fraca. Digitalizar um QR, isoladamente, não prova presença física nem leccionação.
- Validar alternativa operacional sem smartphone ou conexão e critérios claros para registo manual.
- **Aceite quando:** testes e evidências da #340 preservados, migração ensaiada localmente e aplicada apenas após autorização; novo QR comum tratado numa especificação/PR separada se aprovado.
- **Não editar:** motor de contexto ou contas de alunos.

### C1 — Login de alunos e organização anual (continuar a #341)
**Responsável:** engenheiro identidade académica · **Dependência:** inventário de C; **branch/PR independente**.
- Preservar a ficha em Pessoas como cadastro permanente; terminar/renovar matrícula por ano em vez de apagar/mover a pessoa.
- Validar ID escolar/BI + senha, contas existentes, primeiro acesso, 2FA administrativo, listas com ID, pré-visualização das turmas por idade, empates, capacidade, notas e presença já lançadas.
- #341 contém código da #339: evitar aplicar duas vezes, confirmar diff e migrações.
- **Aceite quando:** regressões de login/rolagem anual, segregação tenant, permissões e cenários de dados existentes cobertos.
- **Não editar:** contexto central, sidebar global ou presenças de professores sem coordenação explícita.

### C2 — Integração final coordenada
**Responsável:** C0 + integrador independente · **Dependências:** QA de cada frente.
- Verificar o destino de cada PR e a ordem de integração: #332 antes de #337; #341 inclui #339; #340 pode colidir com rotas/árvore gerada na #332.
- Se `src/routeTree.gen.ts` ou ficheiros partilhados divergirem, regenerar/validar no ramo de integração; **não resolver conflitos apagando alterações alheias**.
- Fazer revisão, checar CI do SHA final, testes de migração em ambiente isolado, autorização e plano de rollback.
- **Aceite quando:** commits, SHA, matriz de testes, diferenças, PRs e bloqueios estão documentados; sem merge/deploy automático.

## 4. Modelo obrigatório de tarefa passada a um agente
Copiar e preencher **apenas um cartão** por sessão:

```text
PAPEL: [A0/A1/A2/A3/A4/A5/B1/C1/C2]
REPOSITÓRIO: fernandotunas6-bot/onsoft-replica-dev
BRANCH/PR BASE: [confirmada pelo coordenador com SHA]
MISSÃO: [um resultado verificável]
OWNERSHIP EXCLUSIVO: [caminhos concretos]
LEITURAS: AGENTS.md + secções obrigatórias + ficheiros estritamente necessários
DEPENDÊNCIAS: [concluídas / não]
NÃO TOCAR: [caminhos de outros agentes, main, produção]
TESTES: [comandos focados e matriz de segurança]
CRITÉRIOS DE ACEITAÇÃO: [verificáveis]
ENTREGA: mudanças mínimas; commit se validado; PR; resumo curto (máx. 12 linhas):
  SHA/base, ficheiros, o que existia, o que mudou, testes, riscos, bloqueios, próximo passo.
REGRA: se a funcionalidade já existir e passar nos testes, marcar VALIDADO e não a reescrever.
```

## 5. Política para economizar contexto e tokens
- Coordenador: inventário inicial e handoff; **não ficar a reler logs/código integral dos agentes**.
- Especialista: ler os contratos e **só os ficheiros do seu ownership**; buscas selectivas; 1 questão ou PR por sessão.
- Resumos persistentes e commits: o próximo agente parte do SHA e do relatório, não de milhares de mensagens antigas.
- `/compact` pode diminuir contexto carregado **mas não repõe quota**; abrir uma sessão nova depois de handoff quando necessário.
- Parar um ciclo improdutivo: após duas tentativas sem evolução, registar bloqueio, hipótese e evidência em vez de repetir a investigação.
- Coordenador só abre novas frentes quando dependências e limites da conta permitirem. Trabalho em paralelo consome a mesma quota partilhada.
- Não confundir número acumulado de tokens de um agente com percentagem de conclusão de código.

## 6. Gates obrigatórios antes de qualquer PR/merge
1. **Integridade:** confirmar ficheiros modificados, ownership e ausência de código de outro agente inadvertidamente apagado.
2. **Contrato:** tipos gerados, RLS, RBAC, MFA, escola activa, ano lectivo e privacidade.
3. **Testes:** focados, lint, typecheck, CI do último commit; testes autenticados e dispositivos marcados como BLOQUEADO quando indisponíveis.
4. **Dados:** migrations isoladas/idempotentes, backup e rollback; nenhuma aplicação em produção sem aprovação.
5. **Visual:** contratos de UI, páginas específicas, performance real antes/depois e navegação mobile/desktop.
6. **Entrega:** PR aberta com escopo curto; confirmar se há dependência de PR empilhada e registar status final.

## 7. PRIMEIRA INSTRUÇÃO PARA O CLAUDE (executar só isto ao abrir)
> Assume o papel C0. Lê `AGENTS.md`, este plano e o ficheiro de estado. Executa apenas A0: reconfirma GitHub PRs e SHAs, mapeia ownership real, CI, trabalho por guardar, dependências e conflitos. Actualiza o handoff com evidências e recomenda exactamente **uma** próxima tarefa desbloqueada. **Não lances agentes paralelos, não reimplementes módulos, não alteres produção ou main.** Aguarda nova orientação depois do relatório A0.
