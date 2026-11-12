# Falhas, riscos e critérios de aceitação — 7 de Outubro de 2026

P0: nenhuma exploração grave, corrupção financeira ou fuga entre escolas foi demonstrada nesta execução. Isso não certifica ausência de P0. F08 e F09 são riscos de segurança cuja verificação autenticada ainda está pendente.

## F01 — Matrícula manual (P1)

**Perfil afectado:** Secretaria / Administrador

**Pré-condições:** Dados válidos; register_student conclui; turma recusa colocação

**Passos para reproduzir:** Executar probes.test.ts; enviar enrollNewStudent duas vezes com a mesma pessoa após falha injectada em enroll_student

**Esperado:** Reaproveitar o aluno criado ou rollback integral, com histórico

**Observado:** 2 pessoas e 2 alunos simulados; ambas as respostas falham; histórico vazio

**Evidência:** src/features/students/server.ts:755; probes.test.ts; evidencias/probes.log

**Causa confirmada ou hipótese:** Confirmada no handler: pessoa/aluno antecedem matrícula; sem chave idempotente/reutilização no reenvio; histórico só no final. Banco real não alterado.

**Correcção recomendada:** Transacção que cubra pessoa/aluno/matrícula ou resultado parcial com studentId e retoma idempotente; validar turma antes de criar; histórico da tentativa

**Critério de aceitação:** Turma cheia/erro/reenvio/duplo clique deixam no máximo um aluno; retoma na ficha; historial auditável; prova UI→API→DB em staging

## F02 — Ano lectivo (P1)

**Perfil afectado:** Administrador

**Pré-condições:** Ano A activo e B existente; segunda actualização falha

**Passos para reproduzir:** Executar probe de setActiveAcademicYear; injectar falha ao activar B após fechar A

**Esperado:** Falha mantém A activo

**Observado:** A fica closed e a operação lança erro; nenhum rollback no handler

**Evidência:** src/features/calendar/server.ts:282; probes.test.ts; evidencias/probes.log

**Causa confirmada ou hipótese:** Confirmada por execução local do handler: duas escritas sem transacção nem compensação (createAcademicYear tem compensação; esta função não).

**Correcção recomendada:** RPC atómica com bloqueio por escola e activação/fecho na mesma transacção

**Critério de aceitação:** Falha após fecho preserva ano activo anterior; duas activações simultâneas deixam exactamente um ano activo

## F03 — Parser de importação (P2)

**Perfil afectado:** Secretaria / Tesouraria

**Pré-condições:** CSV com 25001 linhas identificáveis

**Passos para reproduzir:** Executar probe AUDIT-25001.csv; analisar rows e metadados devolvidos

**Esperado:** Rejeitar ou comunicar excedente, incluindo linhas não analisadas

**Observado:** Só 25000 linhas e nenhum indicador da linha omitida; analyzeImportFile anuncia row_count a partir da lista cortada

**Evidência:** src/features/import/engine/parse.ts:113; src/features/import/server.ts:124; probes.test.ts

**Causa confirmada ou hipótese:** Confirmada no parser real: slice(0, MAX_ROWS_PER_SHEET); XLSX também interrompe no limite (revisto no código; não testado neste probe).

**Correcção recomendada:** Devolver total original/truncated/skipped, ou rejeitar ficheiro acima do limite; impedir commit silencioso

**Critério de aceitação:** 25001 linhas: aviso/rejeição explícitos; contagens do relatório reconciliam com ficheiro; última linha nunca desaparece sem registo

## F04 — Ambientes / CI E2E (P1)

**Perfil afectado:** Operação da plataforma / escolas reais

**Pré-condições:** Configuração local aponta para xodgfmxiaunpamctfeea; nenhuma branch de teste confirmada

**Passos para reproduzir:** Consultar branches; rever ci.yml e scripts @live sem os executar; contar tenants cujo nome/slug identifica E2E

**Esperado:** Testes com escrita usam staging isolado e destinos sintéticos

**Observado:** Só main acessível; 43 de 48 tenants têm nomes de E2E; pipeline activa @live por presença de secret, sem gate de projecto isolado

**Evidência:** evidencias/integrity.json; .github/workflows/ci.yml; scripts/siga/e2e-ecosystem-live.mjs

**Causa confirmada ou hipótese:** Configuração local, ausência de branch isolada e restos confirmados; atribuição de cada tenant a execução específica não verificada. Nenhuma limpeza executada.

**Correcção recomendada:** Separar projecto/segredos de staging; negar ID de produção nos testes; cleanup limitado a fixtures dessa execução; rever resíduos com o dono

**Critério de aceitação:** E2E com configuração de produção recusa antes de qualquer escrita; duas escolas sintéticas só em staging; produção não ganha resíduos

## F05 — PayFlow / cobrança integrada (P1)

**Perfil afectado:** Tesouraria / pagador

**Pré-condições:** Health publicado em modo production

**Passos para reproduzir:** GET https://payflow.portal-siga.com/api/v1/health; inspeccionar runtime

**Esperado:** Serviço com fornecedor, ligação SIGA, SSO e liquidação configurados para o fluxo anunciado

**Observado:** D1 ok; integrationConfigured=false, ssoConfigured=false, provider=unconfigured, paymentInitiationEnabled=false, sigaSettlementConfigured=false e sigaUrl=null

**Evidência:** evidencias/public-http.json

**Causa confirmada ou hipótese:** Estado de configuração confirmado no serviço. Não prova ausência de pagamento manual no SIGA nem impossibilidade de transferência manual no PayFlow.

**Correcção recomendada:** Configurar e homologar fornecedor quando aplicável; configurar ligação/SSO/liquidação; apresentar capacidades indisponíveis claramente

**Critério de aceitação:** Jornada sandbox de factura→cobrança→confirmação→recibo→saldo/portal; webhook repetido e estorno sem duplicação; nenhum dinheiro real

## F06 — Dependências / cadeia de fornecimento (P1)

**Perfil afectado:** Operadores / desenvolvedores; exposição runtime a apurar

**Pré-condições:** Lockfile auditado; @modelcontextprotocol/sdk 1.28.0 e shell-quote 1.10.0

**Passos para reproduzir:** bun audit --audit-level=high; conferir avisos primários

**Esperado:** Sem avisos altos/críticos pendentes

**Observado:** Aviso alto GHSA-6qxp-vccf-f47h via @lovable.dev/mcp-js; crítico GHSA-pqg4-j6r4-53mv via ferramentas de desenvolvimento

**Evidência:** evidencias/dependency-audit.log; advisories GitHub ligados no relatório

**Causa confirmada ou hipótese:** Versões afectadas confirmadas; exploração e alcance em produção não exercitados. Criticidade do advisory não é automaticamente P0 do SIGA.

**Correcção recomendada:** Actualizar dependências transitivas pela origem/override compatível; rever OAuth issuer/token antigo se caminho afectado estiver em uso

**Critério de aceitação:** Audit sem esses avisos; build e testes passam; clientes OAuth não enviam credenciais para issuer diferente; nenhuma mudança automática sem revisão

## F07 — Gate de qualidade: lint (P2)

**Perfil afectado:** Desenvolvimento / publicação

**Pré-condições:** Árvore auditada com alterações pré-existentes preservadas

**Passos para reproduzir:** npm run lint

**Esperado:** Exit 0

**Observado:** 70 erros de formatação e 47 avisos; erros em chat/files/supabaseChatAdapter.js

**Evidência:** evidencias/lint.log

**Causa confirmada ou hipótese:** Confirmada no comando global. Este achado não prova erro funcional no chat.

**Correcção recomendada:** Formatar ficheiro ou delimitar conscientemente ficheiros de referência no lint; manter gate efectivo

**Critério de aceitação:** npm run lint retorna 0 em checkout limpo; ficheiros de produto continuam cobertos

## F08 — MFA na escrita directa de permissões (P1)

**Perfil afectado:** Administrador escolar / contas com papel elegível

**Pré-condições:** Sessão aal1 de administrador em escola de staging; privilégios SQL iguais aos consultados

**Passos para reproduzir:** Consultar políticas, grants e triggers de staff_module_grants; posteriormente tentar INSERT/UPDATE com aal1 em staging

**Esperado:** Alteração de grants exige AAL2, incluindo REST directa

**Observado:** INSERT/UPDATE/DELETE concedidos; políticas só exigem admin/escola e não têm is_aal2; sem trigger nesta tabela. Tentativa com conta real não executada.

**Evidência:** evidencias/mfa-targeted-data.json; evidencias/mfa-effective-data.json; DATABASE_RULES.md 6c

**Causa confirmada ou hipótese:** Omissão da condição MFA confirmada no catálogo. O efeito de escrita com token aal1 é inferência ainda sem reprodução autenticada. Não é prova de exposição entre escolas.

**Correcção recomendada:** Política RESTRICTIVE por comando e revisão do servidor; preparar MFA e recuperação antes de activar bloqueios

**Critério de aceitação:** Em staging: admin aal1 recebe recusa sem alteração; aal2 com grant próprio altera; aluno/professor sem cargo não alteram; catálogo e UI/API concordam

## F09 — Segurança de autenticação (P2)

**Perfil afectado:** Todas as contas

**Pré-condições:** Configuração Auth consultada pelo advisor

**Passos para reproduzir:** Consultar Supabase security advisors

**Esperado:** Protecção de palavras-passe comprometidas activa onde suportada e validada

**Observado:** Advisor auth_leaked_password_protection com WARN

**Evidência:** evidencias/advisors-security-data.json

**Causa confirmada ou hipótese:** Aviso de configuração confirmado; política efectiva de password/cliente não foi exercitada contra contas reais.

**Correcção recomendada:** Rever configuração Auth e política do projecto; activar protecção e validar senha sintética conhecida em staging

**Critério de aceitação:** Senha comprometida é recusada pelo servidor; recuperação e migração de contas mantêm caminhos claros

## F10 — Rastreabilidade da publicação (P2)

**Perfil afectado:** Operação / auditoria

**Pré-condições:** Deploys publicados consultados em leitura

**Passos para reproduzir:** Consultar deployments e versões Cloudflare

**Esperado:** Artefactos reproduzíveis de SHA exacto e checkout limpo

**Observado:** Pages marcam SHA 847dda1fc40df7b88d7aafed40864266762d99dd com commit_dirty=true; Workers têm IDs exactos mas nenhum SHA nas annotations consultadas; checkout auditado é df5009b…

**Evidência:** evidencias/deployments.json; evidencias/inventory-summary.json

**Causa confirmada ou hipótese:** Metadados confirmados. Não é possível afirmar que código local e publicado são idênticos nem quais diferenças locais foram incluídas.

**Correcção recomendada:** Publicar de checkout limpo pelo pipeline; carimbar SHA e versão em todos os apps; conservar artefacto e matriz de deploy

**Critério de aceitação:** Cada app e Worker identifica SHA/versão exactos; dirty=false; smoke e jornada referenciam o mesmo conjunto de versões

## F11 — Estabilidade dos testes de portais (P2)

**Perfil afectado:** Manutenção / revisão de releases

**Pré-condições:** Suite completa com quatro workers; máquina também executava build, lint e browser

**Passos para reproduzir:** npm test -- --maxWorkers=4 --reporter=json; repetir dashboard-portals isoladamente

**Esperado:** Suite completa e isolada passam sem contaminação entre testes

**Observado:** Suite completa: 2 falhas no aluno/encarregado; repetição isolada: 3/3 passam

**Evidência:** evidencias/vitest.json; evidencias/test-failures.json; evidencias/portal-rerun.log

**Causa confirmada ou hipótese:** Falhas e repetição confirmadas. Hipótese de lentidão/cleanup pendente: segunda falha tem dois headings Manuel; primeira JSON STACK_TRACE_ERROR sem causa explícita. Não há falha funcional do portal comprovada.

**Correcção recomendada:** Investigar timeout, promises pendentes e cleanup do harness; repetir a suite com recursos controlados; preservar primeiro resultado

**Critério de aceitação:** Suite completa repetível sem falhas de portal e sem ampliar timeout para mascarar erro; backend real continua exigindo jornada em staging
