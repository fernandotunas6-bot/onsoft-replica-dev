# SIGA Plus — plano executável de adopção open source

**Data:** 25/10/2026. **Base:** `fernandotunas6-bot/onsoft-replica-dev`. **Regra:** melhorar o SIGA actual; não substituir a arquitectura Supabase/Postgres/RLS, Cloudflare, React/TanStack, Tauri nem Flutter.

## Estado verificado e critérios de verdade

Leituras: `AGENTS.md`, `package.json`, `docs/auditoria/17-analise-critica-sistema-2026-10-22.md`, `scripts/siga/e2e-safety.mjs`, `.github/workflows/ecosystem-e2e-live.yml`, `docs/desktop/TAURI_RUNTIME.md` e PRs abaixo. CI verde **não** comprova fluxo autenticado; código existente **não** implica operação homologada; merge e deploy são actos distintos (mas a main pode disparar deploy). Não publicar com base apenas em mocks, testes unitários ou relatórios antigos.

**Entrega deste ramo:** novo `scripts/siga/check-staging-readiness.mjs` e testes `tests/security/staging-readiness.test.ts` / `staging-workflow.test.ts`; workflow @live deixa de fazer `skip` silencioso quando faltam segredos e valida projecto/URL, autorização de escrita e ref E2E antes de instalar dependências. O portão `assertSafeE2ETarget` continua a recusar produção. Foi incluído `tests/e2e/tenant-isolation-live.spec.ts` na suite @live: cria duas escolas de staging com contas distintas, autentica via Supabase, exige a leitura do vínculo da própria escola e bloqueia a leitura da outra. Falha se a limpeza dos tenants deixar erro. A limpeza Playwright usa a rotina de dependências já existente, compara o e-mail de contacto com o tenant criado, procura contas Auth órfãs e exige o token Management API para a purga de dependências; não faz `DELETE schools` directo.

## Fase 1 — staging independente e homologação (P0)

**Já existe:** E2E Playwright opt-in, guards de escola/papel/MFA, testes de RLS e `assertSafeE2ETarget`. **Falta:** staging real identificado e isolado, credenciais próprias e execução E2E completa com relatórios do SHA final. O segundo projecto Supabase observado como inactivo **não** deve ser activado ou reutilizado sem inventário.

1. Provisionar projecto Supabase **novo e independente**, com URL, Auth e Storage separados; origem Cloudflare de ensaio sem wildcard de produção, sem utilizar alunos, credenciais ou facturas reais.
2. Configurar GitHub Environment `staging` com approval rules e estes cinco secrets: `STAGING_SUPABASE_PROJECT_ID`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_SECRET_KEY`, `STAGING_SUPABASE_ACCESS_TOKEN`; nunca colocar chave de serviço ou token de gestão em `VITE_*`. O token de gestão só entra no preflight e na etapa E2E @live, para a limpeza do tenant sintético via catálogo SQL, e requer permissões efectivas no projecto de staging.
3. Reproduzir apenas as migrações canónicas `supabase/migrations/` depois de comparar versões com a base de destino. **Não** aplicar `supabase/migrations-lovable-nao-aplicar/`, nem executar migrações experimentais contra o SGA.
4. Testar no staging duas escolas A/B com administrador, secretaria, professor, aluno, encarregado e tesouraria; MFA AAL1/AAL2, contas sem vínculo, mudança de escola, revogação e sessão expirada. Testar acesso directo à API, não apenas menus.
5. Playwright @live: começar pelos testes já implementados de criação/matrícula/gateway e **isolamento RLS com dois administradores, duas escolas e duas sessões reais** (`tenant-isolation-live.spec.ts`). Completar separadamente as jornadas autenticadas de pautas/notas, chamadas, documentos, perfis, MFA AAL2 e permissões nas *server functions*; o teste de RLS **não substitui** essas provas. Executar `responsive-auth.spec.ts` nas larguras 767/768/1023/1024, zoom e teclado. Pagamento apenas simulado, sem liquidação real.
6. Ensaiar restauro de backup **em staging** e verificar auditoria e semântica das permissões. Rever avisos individuais de `SECURITY DEFINER`, protecção de passwords comprometidas e rotação da credencial Google OAuth exposta historicamente (pelo fornecedor, sem publicar valor).

**Saída:** E2E autenticado executado (sem skip), CI último SHA aprovado, provas de bloqueio cross-tenant, plano de rollback e relatório de staging. O workflow não valida por si só que as credenciais remotas estão activas: só os testes e o inventário confirmam.

**Auditoria de resíduos ao terminar (25/10):** `scripts/siga/check-e2e-staging-residue.mjs` analisa as escolas com slugs sintéticos e as contas Auth `e2e+...@siga-plus.test` em páginas de 200; falha fechado se faltar acesso, se forem ultrapassadas 100 páginas ou se restarem artefactos. Corre mesmo que o pipeline E2E falhe e **nunca elimina dados**. O antigo `e2e-cleanup-stale.mjs` é apenas inventário por defeito e não deve ser considerado prova de limpeza; remoções são operações distintas e devem continuar guardadas. O arnês Python passou a usar NIF fictício derivado do slug, como o helper TypeScript, evitando a reutilização permanente de `5417000000`. Nenhum dado real ou credencial de produção deve entrar nesta verificação.

## Fase 2 — terminar o que os outros agentes já fizeram

**Bloqueio de reconciliação detectado em 25/10:** as tabelas, RPCs e gatilhos de caixa da #283 já aparecem no projecto de produção, mas a versão `20261024110000` falta no histórico. As alterações de idempotência e estorno da #276 ainda não estão reflectidas. Consultar [FINANCE_MIGRATION_DRIFT_2026-10-25.md](FINANCE_MIGRATION_DRIFT_2026-10-25.md) e usar apenas o verificador **read-only** `scripts/siga/check-finance-schema-drift.mjs`; não reaplicar nem reparar o histórico automaticamente. O CI de #276 e #283 passou no último SHA revisto, mas falta staging e compatibilidade real.


| Sequência | PR | Gate de integração |
| --- | --- | --- |
| 1 | [#287 — senhas](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/287) | Cliente/servidor alinhados; recuperação/MFA e CI do último SHA |
| 2 | [#275 — segurança do website](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/275) | AAL2, domínio/tenant activos, URLs seguras, teste anónimo e escolas A/B |
| 3 | [#277 — Puck Studio](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/277) | Empilhada em **#275**; rebase correcto, CSP, acessibilidade, editor em lazy chunk, publicação canário |
| 4 | [#276 — financeiro por finalidade](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/276) | Fluxos factura/tesouraria/conciliação, RBAC, sem prometer emissão fiscal certificada |
| 5 | [#283 — sessões de caixa](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/283) | Empilhada em **#276**; ordem SQL, corridas de fecho/estorno, separação de operador/aprovador |
| 6 | [#288 — desktop](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/288) — **integrada na main a 25/10, 06:26 UTC** | Verificar rollout e validar em dispositivos reais; outbox, isolamento e updater são incrementais, não offline integral |

**Estados revistos a 25/10, 06:26 UTC:** #275, #276, #277, #283 e #287 abertas; #275 e #277 em draft. #288 foi integrada durante esta auditoria. Não integrar #277 nem #283 sem as respectivas bases; não reimplementar backend alternativo da #200. Antes de integrar verificar checks/commits actuais, contratos de schema e impacto do merge que pode publicar. Não alterar branches dos outros agentes neste plano.

## Fase 3 — pilotos independentes, não migração geral

| Upstream | Piloto mínimo | Proibições e métricas |
| --- | --- | --- |
| [pdfme](https://github.com/pdfme/pdfme) | Uma declaração escolar com modelo visual no módulo Documentos | Não alterar IDs/QR, numeração, assinaturas nem autorização; comparar PDF exacto e fontes PT; medir bundle e layout |
| [Uppy](https://github.com/transloadit/uppy) | Um fluxo de upload do módulo Arquivos, preferencialmente headless | Reutilizar `FilePickerModal`, quotas, `siga_files`, metadata e Storage autorizados; sem bucket público nem sistema paralelo |
| [TanStack Table](https://github.com/TanStack/table) + [Virtual](https://github.com/TanStack/virtual) | Uma tabela de alunos com dados fictícios volumosos | Preservar visual/teclado/leitor de ecrã, filtros e paginação server-side; medir scroll e tempo de interacção |

**Gate por biblioteca:** confirmar licença e upstream da versão exacta (incluindo plugins/fontes), dependency pin + lockfile + SCA, necessidade medida, flag por escola, import dinâmico, teste de bundle e memória, teste cross-tenant, regressão visual em dispositivos de entrada, rollback. Não instalar três motores juntos. O projecto já tem jsPDF/ExcelJS e upload com recuperação; provar melhoria antes de acrescentar dependências.

## Fase 4 — bibliotecas institucionais especializadas

- [FullCalendar](https://github.com/fullcalendar/fullcalendar): calendário institucional sem mudar `academic_schedules`; algumas vistas de recursos/timeline são Premium, separar claramente.
- [ZXing Browser](https://github.com/zxing-js/browser): captura de QR via HTTPS, fallback manual; assinatura, expiração, papel, escola e anti-replay conferidos **no servidor**.
- [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js): latência e falhas de Workers/APIs sem nomes de alunos, notas, IPs desnecessários, tokens ou pagamentos; amostragem e retenção.
- [Tiptap](https://github.com/ueberdosis/tiptap): só para comunicações se o editor existente demonstrar lacuna; sanitizar conteúdo e não substituir Puck.
- [Timefold Solver](https://github.com/TimefoldAI/timefold-solver): prova de conceito de horários **em serviço separado Java**, não dentro de Cloudflare Workers, apenas se a instituição precisar de optimização automática de verdade.

Cada piloto tem PR própria, custo de infraestrutura documentado e evidência de qualidade. Não adicionar página que se sobreponha a um módulo existente.

## Fase 5 — offline integral Tauri e Flutter

**Estado:** o Tauri possui Store/Stronghold, cache limitada, outbox de chamadas/notas e updater com protecções, mas a janela escolar abre portal SSR remoto. O Flutter ainda não tem paridade funcional nem cache sensível institucional homologada. **Não chamar a isto offline integral.**

1. Publicar contrato por tipo de dado: o que pode permanecer local, cifragem em repouso, segregação por utilizador/escola, expiração, limpeza, revogação, dispositivo partilhado/perdido e backup.
2. Só após esse contrato estudar [Tauri SQL Plugin](https://github.com/tauri-apps/plugins-workspace) e [Drift](https://github.com/simolus3/drift) para SQLite. O plugin SQL por si só não garante cifra nem sincronização.
3. Reconciliar alterações com idempotency keys, versões e conflitos visíveis; testar offline com duas contas/escolas, rede intermitente, MFA expirado e actividade durante revogação.
4. Empacotar UI escolar **local real**: uma janela que carrega `https://portal-siga.com` não se torna offline só porque o instalador funciona sem internet. Preservar permissões nativas mínimas.
5. Assinar releases, validar Windows/macOS/Linux e rollback; bloquear update com outbox pendente. **Não aceitar pagamentos offline** sem idempotência remota e confirmação do provedor.

**Saída:** instalação e trabalho permitidos sem rede, sincronização sem duplicados ou fuga de dados, revogação testada, prova em dispositivos reais e release reversível.

## Regras invariáveis

- Padrão UI obrigatório: `docs/design/VISUAL_MASTER_2026.md` e `SIGA_VISUAL_MASTER_2026-10-23.md`; sidebar compacta, modais pequenos e apenas os necessários, página com uma função clara.
- Permissões RBAC/MFA/RLS e controlo de escola activa não podem ser negociados por uma biblioteca. O backend é a autoridade de todas as operações.
- Medir antes/depois; não adicionar peso à homepage; lazy loading dos motores especializados.
- Não copiar código GPL/Premium nem assets do upstream sem revisão de licença/distribuição; manter atribuições.
- Não correr migrações, deploy ou cleanup desta PR.

## Matriz de execução desta entrega

| Fase | Estado | Evidência | Próximo gate |
| --- | --- | --- | --- |
| 1 | **parcial** | Guard de staging no workflow + testes de regressão | Provisionar staging e executar E2E remoto |
| 2 | **mapeada** | Dependências das seis PRs documentadas | CI do último SHA, revisão e staging |
| 3 | **planeada** | Contratos para três pilotos | Versão/licença e medição inicial |
| 4 | **planeada** | Upstreams/limites mapeados | Pilotos da fase 3 |
| 5 | **planeada** | Definição de critérios offline | Política de dados e sincronização |

**Não instalado:** pdfme, Uppy, TanStack Table, FullCalendar, ZXing, Drift ou plugin SQL nesta entrega. **Não executado nesta entrega:** E2E autenticado remoto (incluindo a nova prova com duas escolas), migração, deploy, alteração Supabase/Cloudflare ou release. Testes unitários e CI de PR não provam RLS efectiva em staging. Não declarar fases completas sem a prova correspondente.
