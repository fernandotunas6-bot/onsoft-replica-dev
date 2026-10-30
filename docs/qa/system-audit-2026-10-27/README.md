# Auditoria funcional do SIGA Plus — 27/10/2026

## Conclusão e alcance

O sistema tem implementação substancial e testes em vários domínios, mas não está
integralmente homologado. Este ciclo inventariou o ecossistema, executou verificações
locais e de leitura em produção e corrigiu falhas reproduzíveis de contexto e sessão.
O proprietário indicou posteriormente o **Colégio Adventista — Huambo** como escola de testes e forneceu acesso para verificação. A escola está na base partilhada; não foi identificado um projecto de staging independente.
Não se criaram matrículas, notas, pagamentos, utilizadores ou outros dados em produção.

Base: `ac9c8b1b20a3213594fb6ef73546115977e5ff64`, `main`, árvore inicialmente limpa.
Primeiro incremento: `7af5466687587e7624a144c20bb2217d727fb4e7`.
Branch: `fix/system-audit-school-context-20261027`.
As heads das PRs abertas consultadas estão em [open-pr-heads.json](open-pr-heads.json).
Depois da indicação do proprietário, a PR #369 (`eed44e16503d82153e2d97b67dcb6ca1dfb0c8e9`)
foi combinada **apenas no candidato local** para validar compatibilidade: o MFA de
login fica desligado por omissão e só é exigido quando a própria conta o activar.
Os guardas de operações sensíveis mantêm-se. A PR foi posteriormente integrada na main pelo trabalho externo a este ciclo.
O candidato foi alinhado com `origin/main` `c061fb75`, preservando também as
alterações recentes de navegação. Este agente não fez merge de PR nem deploy.
As provas distinguem o SHA da suíte completa do candidato posterior.

Critérios externos consultados: [organização das avaliações no Moodle](https://docs.moodle.org/en/Gradebook),
[conclusão de actividades](https://docs.moodle.org/en/Activity_completion),
[autorização por pedido e menor privilégio da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
e [WCAG 2.2](https://www.w3.org/TR/WCAG22/). São referências de aceitação; não se
copiou outro produto nem se declara conformidade integral.

## Falhas corrigidas no primeiro incremento

| Prioridade | Reprodução antes da correcção | Comportamento corrigido | Evidência |
| --- | --- | --- | --- |
| Alta | Dois `useCurrentAccount` montados: mudar A→B num deles deixava o outro em A; o cookie já indicava B. | Selecção partilhada por `useSyncExternalStore`; menu, cabeçalho e guardas recebem a mesma selecção. | `tests/auth/active-school-switch.test.ts` |
| Alta | O `keepPreviousData` global apresentava a identidade/grants de A enquanto B carregava. | A consulta de identidade não reutiliza o contexto anterior como placeholder; papel guardado só é mostrado se estiver nos papéis actuais. | Mesmo ficheiro, cenário de resposta pendente. |
| Alta | Uma leitura recusada de A terminava depois da escolha B e apagava a selecção actual. | A recuperação de vínculo indisponível só altera a selecção se ela ainda corresponder ao pedido. | Mesmo ficheiro, resposta recusada atrasada. |
| Alta | Expiração/saída externa e troca de pessoa preservavam consultas cujas chaves não têm `userId`. | O `AuthGate` apaga a cache antes de adoptar outra identidade; limpa leituras offline e navegação recente da pessoa anterior. | `tests/auth/session-lifecycle.test.tsx` |
| Alta | Uma verificação MFA pendente terminava depois de `SIGNED_OUT` e voltava a mostrar a sessão anterior. | Gerações de sessão descartam confirmações e bootstrap ultrapassados; renovar o token da mesma pessoa preserva a cache. | Mesmo ficheiro, incluindo leitura pendente após saída. |
| Média | Uma consulta antiga do tenant sobrescrevia marca/plano de B ou terminava o loading de outro pedido. | Só a geração actual publica dados, erro ou fim de loading; subscrições/pedidos são invalidados ao desmontar. | `tests/saas/tenant-context-lifecycle.test.tsx` |

Cobertura adicional: troca noutra aba invalida cada QueryClient uma vez; hidratação
preserva a escola guardada no browser. A fila de operações offline não foi apagada.
As regras de autorização no servidor continuam a decidir acesso e escola.

## Falha funcional real da API móvel de faltas

`GET /api/mobile/absences` sem sessão devolvia HTTP 400 com
`Server function info not found`, confirmado em produção e reproduzido no Worker
local da build. Os testes com mocks dessa função passavam e não detectavam a falha.
A função só era chamada pela rota de servidor e não constava do manifesto RPC.

O serviço passa a ser chamado directamente pela rota após `resolveBearerUserId`:
Bearer verificado e política MFA da conta, seguido de validação do identificador
e de `resolveVisibleStudent` (aluno próprio/educando autorizado). O cálculo de
faltas não mudou. O ensaio no Worker compilado corrigido devolveu
**401 / SESSION_INVALID**, sem configuração ou acesso à base de produção.
Commit da correcção: `18cf39e`. MFA de login continua voluntário conforme PR #369.

Regressão reproduzível, com um Worker **local** já compilado a correr:

```sh
SIGA_BUILT_WORKER_URL=http://127.0.0.1:8788 node scripts/siga/check-built-mobile-absences.mjs
```

O script falhou com a build anterior e passou depois da correcção. Foram também
executados 27 testes de cálculo, API, âmbito, MFA e isolamento. O fluxo autenticado
com dados reais de ensaio continua por homologar.

## Evidência da base efectiva, apenas leitura

- `public`: **215 tabelas, todas com RLS**; 129 com RLS forçado.
- `academic_evidence`: 8 tabelas com RLS. Isto não prova o comportamento de cada política.
- Tabelas e colunas públicas coincidem com o snapshot de 25/10: nenhuma divergência
  nesta comparação. [Resultado](schema-comparison.json). Não se compararam aqui todos
  os índices, funções, triggers ou políticas com o snapshot.
- Os 88 avisos de RLS sem políticas correspondem a 75 tabelas públicas, 8 de
  `academic_evidence` e 5 privadas. Nenhuma dessas tabelas concede SELECT a `anon`
  ou `authenticated`. Não abrir políticas só para eliminar estes avisos informativos.
- 18 funções `SECURITY DEFINER` executáveis por `authenticated` exigem revisão
  individual. Foi lida a definição efectiva de `merge_school_subjects` (autenticação,
  MFA, permissão e escola) e `hr_redeem_teacher_qr_secure` (autenticação e delegação
  à avaliação/resgate). Não se concluiu auditoria de toda a árvore de chamadas.
- Protecção Supabase contra palavras-passe comprometidas desactivada: WARN efectivo.
  Existe verificação HIBP no cliente, que não equivale a imposição no Auth para todas
  as vias. [Orientação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Performance: 221 chaves estrangeiras sem índice de cobertura e 216 índices sem uso
  observado. Medir consultas e janela estatística antes de criar/remover índices.
  [Alertas e ligações de remediação](database-advisors.json).
- `notifications`, `school_announcements` e `siga_chat_messages` constam da publicação
  `supabase_realtime`. O handoff que indica a publicação de avisos como pendente
  não descreve este estado efectivo; isto não comprova entrega num telemóvel.

## Matriz de cobertura e próximos passos

`Parcial` significa implementação encontrada, com evidência limitada; não significa
que todos os percursos do módulo funcionam. As rotas abaixo são páginas ou APIs;
as funções TanStack usam os contratos gerados de `_serverFn`, sem inventar REST paralelo.

| Módulo | Estado | Evidência / rota / contrato | Perfis | Dependência / próximo passo |
| --- | --- | --- | --- | --- |
| Sessão, escola e permissões | Parcial; correcções locais validadas | `auth/server.ts`, `sga-admin.ts`, testes de sessão/contexto | Todos | Homologar duas escolas, vínculos revogados, troca de conta e MFA com Auth real. |
| Dashboard e professor | Parcial | `/`, `/portal`, `dashboard/`, testes de render/alertas | Equipa, Professor, Aluno, Encarregado | Conferir dados e atalhos por perfil em escola de ensaio. |
| Alunos e matrícula interna | Parcial | `/alunos`, `/alunos/$studentId`, `students/server.ts`; SQL transaccional | Administração, Secretaria; leitura autorizada | Cadastro→matrícula→turma→documento, preservando pessoa e histórico anual. |
| Matrícula pública | Parcial | `/matricula/$slug`, `enrollment/`; SQL de matrícula antecipada | Público; Secretaria confirma | Ensaio de candidatura, duplicados, lotação e confirmação sem usar produção. |
| Pessoas e docentes | Parcial | `/pessoas`, `/professores/$teacherId`; SQL de fusão/numeração | Equipa autorizada | Cadastro→conta→atribuição→turma; conferir permissões e histórico. |
| Alumni | Parcial | `/alumni`, portal próprio; `tests/alumni/` | Equipa autorizada; o próprio | Consentimento, exportação e privacidade com contas de teste. |
| Currículo, turmas e disciplinas | Parcial | `/pedagogica`, `academic/`; SQL de disciplinas/turmas | Administração, Secretaria, Professor atribuído | Comparar estrutura, lotação e inscrições; rever PRs #339/#345 sem presumir integração. |
| Avaliações e pautas | Parcial | `/pedagogica?tab=notas`, relatórios; testes de motor, períodos e versões | Professor atribuído; homologação autorizada | Notas em falta≠zero; média provisória≠resultado final; avaliar fecho e reabertura em ensaio. |
| Horários, calendário e presenças | Parcial | `/calendario`, `/professor/presenca`, `/api/mobile/presence`; testes SQL/agenda | Equipa, Professor e consulta autorizada | Verificar dois tempos da mesma disciplina, conflitos e ligação à aula realizada; PR #338 aberta. |
| Faltas por disciplina | Parcial; erro do build corrigido e provado localmente | `/api/mobile/absences`, `dashboard/student-absences.ts` | Aluno, Encarregado vinculado | Publicação pendente; homologar leitura autenticada do próprio aluno e de educando vinculado. |
| Planos, recursos e trabalhos | Parcial | `/planos-aula`, `/api/mobile/work`, `subject-work-server.ts`; SQL de entregas | Professor; Aluno; Encarregado em consulta | Criar→atribuir→entregar→devolver; prazo, anexos e estado real de conclusão. |
| Financeiro escolar | Parcial | `/financeiro`, `/faturas`, relatórios; SQL de pagamentos/caixa/estorno | Tesouraria e equipa autorizada | Confrontar obrigação, pagamento confirmado, recibo e estorno; checklist financeira existente. |
| PAYFLOW | Parcial | Saúde HTTP 200; contratos do SIGA e testes de liquidação | Pagador; administração financeira autorizada | Sandbox homologado de fornecedor; idempotência e reconciliação com confirmação real. |
| RH e salários | Parcial | `/financeiro/rh`, `hr/`; SQL de destino, confirmação e líquido zero | Administração/Tesouraria autorizadas | Presença≠aula dada≠salário; validar competência, aprovação, pagamento e anulação. |
| Documentos | Parcial | `/documentos`, `documents/`; testes e SQL de códigos | Equipa autorizada e destinatário | Pedido→emissão→validação→exportação, permissões e prevenção de duplicados. |
| Arquivos | Parcial | `/arquivos`, `arquivos/`; contratos e segurança de ficheiros | Proprietário e destinatários autorizados | Ensaiar upload, substituição, download e URL assinada fora do âmbito. |
| Comunicações e mensagens | Parcial | `/comunicacoes`, `/api/mobile/chat`, `/notifications`; SQL de público/chat | Perfis e destinatários autorizados | Envio, leitura, anexos e Realtime real; separar aviso local de entrega push. |
| Importação | Parcial | `/importar`, `import/`; parser, limites e rollback | Equipa com grant de escrita | Ficheiros controlados; prévia→importação→erro parcial→reversão. |
| Catracas e dispositivos | Parcial | `/catracas`, `/api/catracas/device-scan`; testes de pulso/tokens | Dispositivo autenticado; equipa autorizada | Hardware e leituras reais; entrada no recinto não prova presença na aula. |
| Integrações e sala virtual | Parcial | `integrations/`, `virtual-classroom/`, callbacks | Escola com instalação/capacidade | Token, capacidade e fornecedor reais; catálogo/atalho não prova integração operacional. |
| SaaS, WEB, ADMIN e DOC | Parcial | Páginas públicas e APIs protegidas; inventário de 18 módulos/185 ficheiros | Público, escola e administrador de plataforma distintos | Signup→provisionamento→subscrição em staging; saúde HTTP não prova o fluxo inteiro. |
| Website escolar | Parcial | `school-website/`, `painel/escolas`; SQL e testes de edição/publicação | Público; editor escolar autorizado | Rascunho→publicação→rollback e duas escolas; PRs #275/#277 abertas. |
| Flutter publicado / estudo YFT | Parcial; execução nativa bloqueada neste executor | `estudo/yft-school-system`, `/api/sga/*`, `/api/mobile/*`; roadmap actual | Perfis efectivamente expostos pela API | SDK Flutter ausente; executar analyze/test/build e testar aparelho, offline e notificações. |
| Protótipo `mobile-flutter` | Parcial, sem paridade publicada | Gateway aponta `/api/mobile-v4`; backend de extensão não montado; 28 testes Node | Aluno/Professor nesse contrato | `mobile-v4/` e `src/features/mobile-v4/` ausentes nesta base; não apresentar o protótipo como app actual nem restaurar arquitectura antiga sem decisão. |
| Desktop | Parcial | 7 testes SQLite; contratos Tauri e cofre no repositório | Posto/conta/escola autorizados | Build nativo, assinatura, actualização, PIN e offline em Windows/macOS. |
| Acessibilidade e desempenho | Parcial | Login Chromium 390/1440, foco e overflow; verificadores estáticos | Todos | Restantes ecrãs, leitor de ecrã, zoom, baixo desempenho e Web Vitals p75 por medir. |

## Provas executadas

### Comportamento esperado nos percursos completos

Estes são critérios de homologação, não resultados já comprovados:

1. **Entrada e contexto:** autenticar uma identidade, resolver vínculo activo e
   escola no servidor, aplicar papel/grants e só depois disponibilizar os dados.
   Não exigir código no login por existirem factores antigos: respeitar a opção
   voluntária da PR #369. Ao trocar escola/conta, não apresentar dados anteriores.
2. **Ingresso e ciclo anual:** pessoa e identificador institucional permanecem;
   candidatura, matrícula e inscrição têm estados próprios. Renovar cria a
   matrícula do novo ano sem apagar a anterior. Mudança de turma respeita ano,
   lotação e permissões; uma política etária é configurável e revê excepções.
3. **Ensino e aula:** curso/nível → turma → disciplina → docente atribuído → tempo
   de horário → ocorrência → chamada e evidência da aula. Entrada no recinto,
   presença docente, presença discente e aula realizada são factos distintos.
4. **Avaliação:** períodos, escala, pesos e regras pertencem ao contexto da escola,
   ano, curso e ciclo. `null` não é zero. Uma média provisória não produz decisão
   final com componentes obrigatórias em falta; homologação fecha e versiona a
   pauta. Recurso/reabertura preservam decisão anterior, motivo e auditoria.
5. **Aprendizagem:** professor atribui actividade e critérios; aluno vê o que falta,
   entrega dentro da política de prazo e recebe devolução/avaliação. Anexo enviado,
   actividade concluída e nota publicada não são estados equivalentes. É a
   separação inspirada nos percursos de avaliação e conclusão do Moodle.
6. **Dinheiro:** obrigação → factura → tentativa de pagamento → confirmação do
   fornecedor → recibo e movimento conciliável. Redireccionamento ou comprovativo
   carregado não significam pagamento confirmado. Reenvio não duplica; estorno é
   auditado e conserva o movimento original. Salários seguem aprovação/competência.
7. **Documentos, ficheiros e mensagens:** destinatário, vínculo e escola são
   verificados em leitura, escrita, exportação, anexo e URL assinado. Falha de
   rede/serviço não pode aparecer como documento emitido ou mensagem entregue.
8. **Dispositivos e operação diária:** sem rede, indicar origem/data dos dados;
   reenvio verifica novamente conta, escola e operação. Um evento atrasado não
   actualiza a conta seguinte. Testar teclado, foco, zoom e aparelho de entrada.

Resultados consolidados e comandos estão em [validation.json](validation.json). Já disponíveis: [46 cenários SQL locais](sql-results.json),
[ensaio Chromium do login](browser-results.json), [390 px](login-390.png) e
[1440 px](login-1440.png), repetidos no Worker compilado do candidato combinado.
As capturas usam sessão vazia, sem dados pessoais, e
pedidos externos bloqueados no browser. Não são uma comparação visual antes/depois.
O Worker deste ensaio não recebeu credenciais Supabase: leituras de configuração
em segundo plano falham, como esperado, e não fazem parte da validação do login
visual. Não se autenticou ou criou nenhuma conta pelo formulário.

As contagens de validação referem-se aos SHAs indicados em `validation.json`.
Testes com mocks validam os cenários locais descritos; a falha de faltas exigiu
também executar a saída compilada para reproduzir e confirmar a correcção.

## Continuação necessária

1. Preparar ambiente isolado com duas escolas fictícias, dados controlados e contas
   Administração/Secretaria/Tesouraria/Professor/Aluno/Encarregado. Reutilizar as
   guardas de segurança E2E; não apontar testes de escrita à base real.
2. Percorrer os fluxos da matriz e guardar evidência por perfil: sucesso, erro,
   recurso de outra escola, vínculo revogado, rede lenta e resposta fora de ordem.
3. Priorizar integridade académica/financeira e permissões antes de ampliar interfaces;
   usar os contratos mestres pedagógico e financeiro e rever as PRs abertas por SHA.
4. Só classificar o módulo como validado depois de cumprir o fluxo completo e explicitar
   limites. CI verde, RLS activo e saúde HTTP são evidências complementares.

## Consulta autenticada no Colégio Adventista — 28/10/2026

Entrada autorizada com a conta de testes fornecida pelo proprietário, sem pedido
de MFA. Foram abertas `/portal`, `/alunos`, `/pedagogica`, `/financeiro`,
`/documentos`, `/arquivos` e `/calendario`: HTTP 200, área principal visível,
identificação Adventista presente e nenhuma excepção JavaScript observada.
[Resultados sem credenciais](authenticated-readonly-results.json). Não se guardaram
cookies ou tokens e não se incluíram credenciais nos artefactos. Esta prova
não confirma cada consulta de dados, botão, gravação ou operação financeira.

Verificação agregada de leitura: um ano activo e zero divergências de escola
nas relações matrícula→aluno, matrícula→turma e turma→ano. Não houve alteração
dos registos institucionais. A escola de testes partilha a base de produção;
os testes automatizados de escrita que exigem projecto isolado continuam pendentes.

Validação após alinhar com a main `c061fb75`: **433 testes de regressão em
50 ficheiros**, zero falhas, build aprovado e lint dos ficheiros de código
alterados sem erros (dois avisos Fast Refresh). A suíte de 5320 testes refere-se
ao SHA anterior indicado em `validation.json`, não às alterações recentes de toda
a main. A geração do build removeu uma declaração TanStack duplicada da árvore
de rotas.

Verificação TypeScript final após esse alinhamento: `npm run typecheck`,
código de saída **0**. Entrega para revisão na [PR #376](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/376),
em rascunho; sem deploy.
