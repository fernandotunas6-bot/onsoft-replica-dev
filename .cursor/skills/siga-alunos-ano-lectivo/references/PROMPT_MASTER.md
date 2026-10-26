# PROMPT MASTER — SIGA PLUS 2026
## Conta do aluno · Login por ID/BI · Pessoas · Matrícula anual · Turmas A–Z · Navegação contextual

**Missão:** actuar como equipa sénior de engenharia de sistemas escolares, segurança de autenticação, modelação académica, produto e UI/UX. **Continuar a PR #339** no projecto existente `fernandotunas6-bot/onsoft-replica-dev`, preservando os dados e a arquitectura actual. É uma especificação de implementação, não prova de execução.

## P0 — Prioridades inegociáveis

1. Nada de reescrever sistema; **inventariar e melhorar o que existe**.
2. Login fiável e privado por número escolar/BI + senha da conta Auth; não expor contas nem quebrar MFA.
3. Pessoa, aluno e ID estáveis; a matrícula e a turma mudam por ano sem perder histórico.
4. Separar progressão/retensão da **distribuição por idade**. A turma A recebe os mais novos, B os seguintes e assim por diante **somente quando a escola escolhe esta política**.
5. Operações de lote apenas com **pré-visualização, confirmação, revalidação no servidor, transacção e auditoria**.
6. Aparência SIGA Plus: rápido, nítido, discreto, uma página uma função, sidebar por contexto, sem modais pesados nem novos menus paralelos.
7. Testar com escolas e utilizadores distintos antes de considerar integração; nenhum SQL automático ou deploy de produção.

## P1 — Inspecção prévia obrigatória

Ler por ordem:
- `AGENTS.md`; `docs/agents/DATABASE_RULES.md`; `docs/agents/CONTINUE.md`.
- `docs/design/VISUAL_MASTER_2026.md`; `docs/design/SIGA_VISUAL_MASTER_2026-10-23.md`; `docs/design/CONTEXTUAL_VISUAL_INTEGRATION.md`.
- `docs/specs/SIGA_STUDENT_LOGIN_AGE_CLASSES_ROLLOVER_2026-10-26.md` e `docs/design/STUDENT_LOGIN_CLASSES_CONTEXTUAL_UI_2026-10-26.md`.
- Skills `siga`, `siga-alunos`, `siga-pessoas`, `siga-acessos`, `siga-pedagogica`, `siga-matricula`, `siga-performance`.
- O último commit de `main`, da branch desta PR e PRs paralelas de sidebar/contexto (incluindo #332 quando aplicável).

Mapear código real, SQL e permissões existentes, não criar tabelas/rotas baseado apenas em palavras deste prompt. Marcar o que está **implementado**, **parcial**, **proposto** ou **bloqueado**.

## P2 — Modelo conceptual canónico

```text
ESCOLA (school_id)          IDENTIDADE AUTH (auth.users)
  └── PESSOA (people) ──────── user_id, quando validamente ligada
        ├── vínculo ALUNO (students) com student_number estável POR ESCOLA
        │      ├── matrícula 2025 (enrollments) -> classe/curso/turma 2025
        │      ├── matrícula 2026 (enrollments) -> classe/curso/turma 2026
        │      └── matrícula 2027 (enrollments) -> classe/curso/turma 2027
        │             histórico, pautas, boletins, presença, documentos
        └── outros papéis (docente, encarregado, funcionário) conforme tabelas
```

**Não fazer um UPDATE em `people` no fim do ano para retirar alunos**; eles já constam de Pessoas e continuam a constar. A mudança é de contexto académico. `people` está actualmente scoped por escola: não presumir uma tabela global de pessoas idêntica em todos os tenants.

`student_number` é dado visível e interno da escola, não o UUID. A cadeia `1 + AA + NNNN` existente não deve ser regenerada por transição anual. Se dois tenants têm `1260001`, o contexto da escola é obrigatório para resolver a conta.

Chaves e índices: não alterar sem ler snapshot de produção e migrações; conservar `enrollments`, `class_groups`, `grade_levels`, `academic_years`, `student_academic_history`, `people`, `students`, `school_memberships` e contratos de documentos.

## P3 — Login do aluno: auditoria e execução

**Fluxo:**
```text
Escolha/validação do domínio escolar
 -> Introduzir ID escolar / BI / e-mail (conforme opção)
 -> Senha da conta Supabase Auth
 -> Resolver identidade exclusivamente no servidor
 -> Aplicar rate limit + captcha + sessão segura
 -> MFA se requerido
 -> Confirmar escola, papel, vínculo activo e contexto
 -> Portal do aluno com os dados que o servidor autoriza
```

Critérios:
1. Investigar primeiro `AuthGate.tsx`, `src/features/access/server.ts`, `student-number-login.ts`, `bi-login.ts`, `bi-identity.ts` e `portal-engine.ts`. Conservar assinaturas públicas compatíveis e testes.
2. **E-mail**: usar login padrão Supabase Auth. **BI**: normalizar/validar, resolver `people.user_id` único/vinculado; consultar e-mail efectivo em `auth.users` no servidor, nunca usar `people.email` como prova; BI em múltiplas escolas nunca escolhe uma conta arbitrária. **Número**: resolver por tenant/domínio seguro e preferência explícita da escola; ID ambíguo no domínio geral pede o portal da escola.
3. Do browser nunca sair lista de candidatos, e-mail privado ou informação da existência de BI/ID; erro genérico em casos não autenticados, registos de auditoria sem valores completos.
4. Assumir contas históricas sem `user_id` como pendências de vinculação assistida com verificação do titular/encarregado; não atribuir senhas por número de processo, nome, BI ou data de nascimento.
5. Aluno sem e-mail próprio: fluxo escolar institucional de recuperação com secretaria/encarregado validado, acções sensíveis limitadas por papel e AAL2; evitar reset directo perigoso de identidades com vínculo noutras escolas.
6. Captcha, rate limiting por endereço de origem e conta/escola, logs mínimos, proteção contra força bruta e regressões de rate limit depois da mudança. Distinguir erro de infra, captcha, credenciais, conta não confirmada e escola ambígua sem enumeração.
7. Expiração de sessão, troca de escola, contas com múltiplos vínculos e tokens antigos não podem atribuir permissões de outra escola. Conservar MFA no contexto correcto; o token não é autorização suficiente sem guardas de servidor.
8. UX minimalista e contextual: marca escolar, campo `Identificador (ID, BI ou e-mail)`, senha, mostrar/ocultar, recuperação, escolha de escola quando realmente necessária, erros curtos, loading não bloqueante, teclado e leitores de ecrã. Respeitar website escolar e CTA de portal.
9. Disponibilizar teste de integração do fluxo completo com Supabase Auth em staging isolado, sem credenciais reais documentadas.

**Matriz de ensaios de login**:
- aluno novo vinculado; aluno antigo vinculado; aluno sem user_id; matriculado antecipadamente; concluído com acesso histórico;
- BI normal, formatado com espaços e pontuação; BI repetido em duas escolas com **mesmo** Auth user; BI repetido com **diferentes** Auth users;
- ID igual em duas escolas; domínio escolar válido; domínio geral ambíguo; login por e-mail; segredo incorrecto; 429/rate limit/captcha inválida;
- encarregado com vários educandos, professor que também é encarregado, utilizador sem pertença; sessões com mudança de escola, MFA e acesso revogado;
- Android, iOS, desktop, PWA e rede lenta.

## P4 — Preparação do ano e percurso do estudante

1. Ler regras do calendário escolar, períodos, pauta final, reclamação e bloqueios. Não inferir aprovação por simples média informal nem por idade.
2. Fecho: guardar resultados, nota final validada, status aprovado/retido/concluído/transferido/incompleto, vínculo documental e histórico. Impedir edições não autorizadas em ano fechado.
3. Preparar estrutura do destino: ano, calendário, cursos, classes, disciplinas, salas, turnos, limites de vagas e turmas. Não copiar professores/horários/pagamentos do passado cegamente.
4. Gerar plano de renovação individual usando `year-rollover{,-server}.ts` e `enrollment-core.ts`. "Aprovado" = classe seguinte dentro do mesmo curso; "Retido" = classe actual; fim de curso = concluído; sem resultado = requer decisão; transferido/inactivo = revisão e não execução automática.
5. Em vez de mover pessoas fisicamente para o registo, `Pessoas > Preparar Ano Lectivo` deve mostrar quem tem cadastro e pode ser rematriculado. Uma pessoa existente não deve ser novamente criada.
6. A escolha da turma no novo ano passa por `Organizar Turmas` quando activado; a heurística legada de conservar letra (`7.ª A → 8.ª A`) **não prevalece** sobre o critério de idade.
7. Matrícula antecipada válida para o ano seguinte continua possível; nunca confundir com matrícula em vigor, nem limpar aluno por causa do fecho. Respeitar `pickCurrentEnrollment`.
8. Nunca reemitir número escolar no rollover. Não mover ou apagar notas, assiduidade, propinas, faturas, contratos, recibos e IDs de documentos de anos anteriores.
9. Desenhar modo simulação com diferenças e excepções, confirmação da Secretaria/Admin e relatório auditável por aluno.

## P5 — Organização por idade A–Z

**Política configurável por escola:**
- `youngest_first_A_to_Z` = menor idade → A, em ordem de data de nascimento decrescente.
- `manual` / `balanced` só quando existirem as regras e UI autorizadas; sem inventar um algoritmo alternativo invisível.
- Desligado por omissão até aprovação institucional; a política é preferência da escola, não imposição legal identificada.

**Alocação por contexto estrito:**
`school_id + academic_year_id + grade_level_id + program_id + shift`, somando campus/apoio/currículo quando exigidos.

**Passos:**
1. Seleccionar ano futuro e classe/curso/turno, sem misturar níveis.
2. Reunir alunos elegíveis após decisão de progressão/retensão; remover duplicados; não incluir outra escola.
3. Ler `birth_date` real da pessoa, validar ISO e fonte documental quando necessário; dados em falta vão para a fila de excepções — não estimar idade.
4. Definir data de referência fixa do ano; ordenar por data de nascimento desc; em empate, número escolar e id estável.
5. Ordenar turmas pelo identificador da letra `A,B,...Z,AA,AB`, não pelo nome livre; validar turma, estado, sala e limites de capacidade legal.
6. Preencher A até o limite **real**, depois B, etc. Lotações reservadas, matrículas existentes e colocações protegidas são verificadas e explicadas.
7. Pré-visualizar contadores, alunos excluídos, id oficial, nome, turma anterior/proposta, vagas e se `A = mais novos` é estritamente verdade. Filtros nunca criam uma turma misturada.
8. Com matrículas já publicadas ou avaliação em curso, evitar redistribuição silenciosa. Para vagas tardias, alocar sem mexer nos outros e avisar quando a regra global estrita já não é satisfeita.
9. Casos de apoio, irmãos, transporte, turno preferido, retenção e lotação especial exigem revisão e protecção de dados pessoais.
10. **Não publicar com base apenas no motor** `class-age-allocation.ts`. É puro e não faz escrita. Servidor deve recomputar contra snapshot actual, controlo de acesso e função transaccional/locks de capacidade.

**Colunas de avaliação antes de publicar:** `ID aluno`, `Nome`, `Classe`, `Curso`, `Turno`, `Nascimento verificado`, `Idade de referência`, `Turma actual`, `Turma proposta`, `Motivo/excepção`. Mostrar datas pessoais só a papéis autorizados.

**Escrita futura segura:** plano com versão/hash, isolamento por escola, snapshot de vagas, `AAL2` e `requireSgaWriterForWrite`, lock de turmas, validação de matrícula/ano/curso/turno, idempotency key, transacção, auditoria, reversão até publicação e relatório de falhas. Não executar alterações parciais silenciosas.

## P6 — UX e estrutura visual contextual (contrato aplicável)

Cumprir o documento visual dedicado e as referências superiores. **A interface não deve apresentar todos os módulos num único ecrã nem usar modais longos para substituição de páginas.** Estrutura:

- **Login**: página pública dedicada à identificação + senha; escolher escola apenas se necessário; formulário central sem barras de administração; preserva estilo da marca e acessibilidade.
- **Pessoas**: registo central, pesquisa e filtros, vínculos e perfis. Acção de preparação anual abre página autónoma de `Preparar Ano Lectivo`.
- **Preparar Ano Lectivo**: escola/ano em cabeçalho; só elegíveis/pendentes/excluídos; previsão de progressão; entrada em `Organizar Turmas`.
- **Organizar Turmas**: painel dedicado (não modal), contexto da classe/curso/turno; opção de política, simulação, tabela antes/depois, lotação, conflitos e CTA de revisão. Publicar só quando as barreiras de segurança existirem.
- **Turma**: menu de entidade com alunos (ID incluído), disciplinas, horário, avaliações, trabalhos, presenças e materiais. Não mostrar tesouraria global da escola dentro da turma.
- **Aluno**: identificação, académico, financeiro autorizado, documentos, histórico. Estado da turma e do ano seleccionado. Nunca misturar dados de outra escola.
- **Renovação**: página dedicada já existente; seleccionar ano, ver resultado final, aprovar proposta e renovar. A sugestão automática da letra é desactivada ao aplicar política por idade.
- **Exportação de listas**: PDF/CSV/Oficial reutilizando mecanismos e `student_number`, sem segundo ID falso.

**Sidebar:** margem esquerda exterior recta, superfície junto ao conteúdo com transição côncava/inversa à direita conforme contrato SIGA; compacto por defeito; grupo contexto módulo → turma/aluno; hover não obriga a expandir quando contraído; ícones discretos, destaque exacto da rota actual; breadcrumb curto. Em mobile, navegação contextual por menu/«Mais» existente. Não reimplementar motor de contexto nem menu global paralelo.

**Design system:** Inter 400/500/600, ícones Lucide de `app-icons`, tokens de superfícies `--background`, `--foreground`, `--border`, `--sidebar-*`, `--primary`, estados semânticos; raio consistente; sombras mínimas; 44px táctil quando aplicável; foco visível; WCAG 2.2 AA; smooth sem latência artificial; animações reduzidas; nenhuma nova abertura em vídeo.

**Responsive:** desktop 1440/1024, tablet 834/768 e mobile 390/360. Tabelas densas e legíveis em desktop; cartões/listas equivalentes em mobile, mantendo IDs e acções. Scroll previsível, sem overflow, filtros com persistência e IDs de URL validados.

**Performance:** não adicionar dependências para estética; lazy por rota, paginação server-side e cache por `schoolId + academicYearId + role + context`, deduplicar pedidos de Pessoas/Alunos, invalidar ao trocar escola e ano; nunca cache pública de PII; carga progressiva e feedback imediato sem sucesso fictício.

## P7 — Segurança, dados e isolamento

- Separar autenticação de autorização; tokens emitidos não dão acesso a turmas por si só.
- Ler `DATABASE_RULES.md`. RLS forçada nos dados privados; service role só em servidor; RPC sensível em schema privado quando pertinente.
- Na escola A, mudar ID/URL para aluno da escola B deve devolver não autorizado/null mesmo para professor de A.
- A própria lista de turma não pode mostrar BI, e-mail, data de nascimento completa ou financeiro a papéis sem acesso explícito.
- Chaves/cache/recentes por escola, papel e ano; ao sair, limpar dados privados e invalidações adequadas.
- Auditoria de identificação, matrícula, mudança de turma e fecho anual. Logs sem senha, tokens, BI completo e PII indiscriminada.
- Operações repetidas, concorrentes, timeout de rede e aplicação parcial precisam de testes; gravações transaccionais com retorno verificável.
- Não fazer migração genérica no Supabase de produção por configuração visual; mudanças de schema exigem revisão, ambientes isolados e aprovação.

## P8 — Matriz de aceite mínima

| Fluxo | Evidência necessária |
| --- | --- |
| BI vinculado ↔ Auth | Mesma conta correcta mesmo que `people.email` esteja errado; BI com dois `user_id` rejeitado |
| Login por ID | Host/tenant correcto, opção da escola ligada, senha válida, ambiguidades recusadas |
| Login portal | Papel certo, sessão/MFA correctos, troca de escola não mostra cache de escola anterior |
| Cadastro | Pessoa e `student_number` preservados após fecho anual; sem duplicação |
| Renovação | Aprovado/retido/concluído/sem resultado/transferido com destinos correctos |
| Idade | Turma A os mais novos por data válida, desempate estável; respeita lotação |
| Excepções | Sem nascimento, protected placement, escola/curso/turno errado, duplicados e vagas esgotadas |
| Histórico | Pautas/notas/presenças e documentos do ano antigo permanecem acessíveis conforme permissão |
| Lista | ID visível em Alunos, renovação, turmas e exportações pretendidas |
| UI | Uma finalidade por página; contexto/rota/sidebar coerentes, desktop + mobile |
| Segurança | RLS, AAL2, permissões, concorrência, não enumeração de contas e isolamento entre escolas |
| CI | Lint, TS, unitários, build, segurança e testes E2E necessários aprovados |

## P9 — Ordem concreta de commits

1. Corrigir regressões verificadas de CI, actualizar testes legados para nova política de identidade **sem relaxar a segurança**.
2. Completar testes e funções de vinculação segura das contas legadas; nenhuma criação automática insegura.
3. Uniformizar ID escolar nas listas actuais e exportações.
4. Adicionar rotas contextuais de preparação e organização com simulação, autorizadas por papéis.
5. Integrar progressão anual, evitando heurística de conservar a letra quando política etária estiver activa.
6. Criar RPC transaccional com auditoria e bloqueios apenas após revisão do schema e ensaio isolado.
7. Validar com duas escolas, contas reais de staging, acessibilidade, visual e performance; publicar evidência.
8. Só então rever merge/deploy. Não fazer force-push nem alterar `main` sem revisão.

## P10 — Relatório final obrigatório

Para cada entrega, indicar:
- caminho dos ficheiros e componentes alterados;
- o que já existia e foi reutilizado versus o que foi efectivamente criado;
- problemas corrigidos e riscos restantes;
- comandos e resultados reais de testes (não presumidos);
- dados e migrações **não** modificados;
- evidências visuais e matriz de contextos;
- commit SHA e PR, decisão de merge e bloqueios.

**Critério de conclusão:** um aluno consegue entrar com credenciais institucionais sem exposição de dados, preserva identidade e percurso anual, a escola prepara turmas A–Z por idade quando escolhe essa regra, e tudo funciona por contexto e permissões com uma interface SIGA nítida, rápida e estável.
