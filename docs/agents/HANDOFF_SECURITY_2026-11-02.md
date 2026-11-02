# SIGA Plus — Segurança e infraestrutura, fase 1 (handoff Claude Code)

**Data:** 02/11/2026 (WAT)  
**Repositório:** `fernandotunas6-bot/onsoft-replica-dev`  
**Branch:** `security/phase1-api-input-cache-20261102`  
**Estado:** implementação parcial em branch isolada; **sem merge, deploy, SQL aplicado ou alterações Cloudflare/DNS**.  
**Missão:** melhorar sem remover funcionalidades; evidenciar os controlos existentes, resolver lacunas reais e preparar continuação por Claude Code.

## 1. Antes de trabalhar

Ler, por esta ordem:

1. `AGENTS.md`
2. `docs/agents/ARCHITECTURE_HARMONIZATION.md`
3. `docs/agents/CONTINUE.md`
4. `docs/agents/DATABASE_RULES.md`
5. Este handoff
6. As skills `.cursor/skills/siga/SKILL.md` e específicas do módulo afectado

**Advertência:** a base Supabase SGA ligada ao Lovable contém dados de escolas reais. Não aplicar migrações, desactivar RLS/MFA, ler dados sensíveis ou executar carga intrusiva contra produção para verificar hipóteses. Staging isolado antes de qualquer teste de escrita ou mudança de infraestrutura. A `main` activa pipelines de deploy automático: não integrar sem validar as dependências.

## 2. Inventário observado no código (não equivale a auditoria integral em produção)

| Controlos / componentes | Evidência | Estado |
| --- | --- | --- |
| Rate limiting distribuído | `src/lib/shared-rate-limit.ts`, RPC `siga_rate_limit_consume` | Código encontrado; funcionamento da RPC em produção não retestado |
| Fallback local de rate limit | `src/lib/rate-limit.ts` | Código encontrado; memória por isolado, menor garantia |
| Limitação no login e OTP | `src/features/access/server.ts`, `src/features/otp/otp-dispatcher.ts` | Referências encontradas; testar fluxos E2E |
| Cabeçalhos HTTP | `src/lib/security-headers.ts` e `src/server.ts` | Código existente; verificar cabeçalhos efectivos |
| CSP | `src/lib/csp.ts` | **Report-Only**, ainda não bloqueante |
| Correlation IDs | `src/lib/request-id.ts`, `src/server.ts` | Código encontrado |
| Auth e autorização | `src/integrations/supabase/`, `docs/agents/DATABASE_RULES.md` | Mecanismos existentes; manter RLS, grants e regras da escola |
| DNS/Cloudflare | `docs/cloudflare/OVERVIEW.md`, `scripts/siga/check-platform-dns.mjs` | Documentação/scripts; **configuração real não verificada** |
| SQL seguro | Cliente Supabase e várias RPCs; `tests/security/` | Auditar consultas SQL dinâmicas, EXECUTE e SECURITY DEFINER; não declarar cobertura total |
| Hash de palavras-passe | Supabase Auth é fornecedor principal | **Não** substituir por hash artesanal no cliente |

## 2A. Verificações reais READ-ONLY realizadas em 02/11/2026

As seguintes verificações foram executadas pelos conectores dos serviços com acesso autorizado, **sem qualquer mutação**. Isto substitui suposições do ficheiro `docs/cloudflare/OVERVIEW.md` sobre o estado activo.

### Cloudflare (zona portal-siga.com)

- Zona: **active**, plano **Free Website** (confirmado via API).
- DNS: 13 registos na zona; os hosts `portal-siga.com`, `*.portal-siga.com`, `app`, `www`, `admin`, `docs` e `payflow` aparecem com `proxied=true`. Não inferir destes dados que todas as aplicações respondem correctamente nem que o TLS está adequado.
- WAF gerido: ruleset presente, **38/38 regras habilitadas**.
- DDoS HTTP L7: ruleset presente, **147/148 regras habilitadas** (a contagem inclui assinaturas administradas pelo fornecedor; não configurar 148 regras manualmente).
- Rate limiting: **1 regra activa** no ruleset de zona, destinada a verificação de credencial vazada. **Não equivale a rate limit geral das rotas de login/OTP/exportação**. Como o plano Free pode limitar a quantidade de regras, priorizar controlo aplicacional distribuído e avaliar cobertura sem substituir a regra existente.

**Verificação adicional por API (somente leitura, 02/11):**

| Definição Cloudflare | Valor observado | Decisão recomendada |
| --- | --- | --- |
| SSL/TLS Encryption Mode | `full` | Candidato a **Full (strict)**, **somente** após confirmar certificados válidos nas origens e Workers/Pages/domínios personalizados |
| Minimum TLS Version | `1.0` | Avaliar elevação para **TLS 1.2+** e impacto em dispositivos/integrações antigas; confirmar matrizes de clientes |
| DNSSEC | `disabled` | Planear habilitação coordenada com o registrador, registos DS e monitoramento, não activar cegamente |
| Always Use HTTPS | `off` | Auditar regras de redirect já existentes, OAuth/webhooks e subdomínios; garantir HTTP→HTTPS sem loops e só então activar |

**P1 de infraestrutura: não alterar nenhuma destas definições automaticamente.** Fazer inventário de origens e certificados, provar conectividade em staging/teste controlado, preparar snapshots das regras, rollback e validação por hostname; obter autorização para cada alteração de zona. A ausência de `Always Use HTTPS` não comprova ausência de outros redirects HTTP→HTTPS.

**Pendente de verificar:** HSTS real, DNSSEC/DS no registrador, correcta resposta dos hosts, rotas de Worker, acesso `workers.dev`, histórico de falsos positivos, WAF por endpoint e limites da subscrição. Não alterar registos/zonas para apenas “corrigir” um documento antigo.

### Supabase (SGA)

A leitura do Security Advisor da base ligada reportou:

- **18 avisos WARN:** `authenticated_security_definer_function_executable`. Analisar **cada assinatura/função**, os `GRANT EXECUTE`, o `search_path` e verificações de pertença/papel; não revogar EXECUTE cegamente porque funções legítimas `public` podem depender delas.
- **1 aviso WARN:** `auth_leaked_password_protection`. Avaliar activação no painel Auth e o impacto nos fluxos de criação/recuperação, políticas de passwords e licenciamento, sem desactivar o login existente.
- **90 INFO:** `rls_enabled_no_policy`. Pode indicar intencionalmente tabelas **server-only**; nem sempre é vulnerabilidade. Confirmar schemas expostos, `GRANT`, RLS, `service_role` e fluxos esperados antes de abrir políticas.

Referências do Advisor:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

**Interpretação:** o Advisor dá alertas para investigar, não prova por si só de acesso indevido ou exploração. Nenhum SQL foi executado para alterar o estado.

### Auditoria read-only das funções privilegiadas (18/18)

O inventário completo, testes sugeridos e evidências por função estão em
[`SECURITY_DEFINER_AUDIT_2026-11-02.md`](./SECURITY_DEFINER_AUDIT_2026-11-02.md).

Constatações verificadas em `pg_proc`, `pg_get_functiondef` e `pg_constraint`:
- As **18** funções com aviso do Supabase Advisor permitem `EXECUTE` a `authenticated`, mas **nenhuma das 18 permite `EXECUTE` a `anon`**. Todas têm `search_path` explícito.
- `merge_school_subjects` exige utilizador autenticado, **AAL2**, `private.has_permission` para `academic.subjects.manage` na escola indicada e valida que as disciplinas pertencem à escola. Isto melhora a avaliação inicial; **falta testar autenticação cruzada e concorrência em staging**.
- `current_school_id()` verifica vínculo escolar activo antes de aceitar `x-siga-school-id`. O papel escolar e os testes do professor delegam em funções de contexto que consultam vínculos activos.
- `member_roles` e `role_permissions` têm FKs compostas com `school_id`, reforçando isolamento multi-tenant em RBAC.
- A função QR `hr_redeem_teacher_qr_secure` encaminha para `hr_redeem_teacher_qr`, que verifica professor, ocorrência, QR activo e evidência recente, mas ainda precisa de ensaio autenticado de replay, tempo e escola B.

**Decisão:** não revogar permissões nem mudar RLS/SQL de produção com base apenas no aviso do Advisor. Preparar testes de duas escolas isoladas em staging, sem tocar em dados reais.

## 3. Implementação realizada nesta branch

**Alteração A — limite de JSON para a entrada móvel:** `src/lib/read-json-body.ts` disponibiliza `readJsonBodyLimited(request, maxBytes)`. A verificação não confia apenas em `Content-Length`: mede o corpo real em streaming e cancela a leitura ao ultrapassar o limite. Responde com `too_large` ou `invalid_json`. A rota `src/routes/api/mobile/login.tsx` limita o pedido a 16 KiB e devolve HTTP 413 sem invocar o serviço de autenticação quando o corpo excede esse limite. O JSON malformado continua a ser tratado pela validação existente do login, por compatibilidade.

**Alteração B — não-cache de tokens:** `src/lib/ecosystem-cors.ts` passa a aceitar `{ noStore: true }` para respostas JSON sensíveis. A rota de login móvel usa `Cache-Control: no-store` nos resultados 200, 401, 429, 503 e 413 e nas respostas de erro controladas. As restantes rotas mantêm o comportamento de cache anterior; rever separadamente perfis, dados académicos e financeiros.

**Testes acrescentados:**
- `tests/security/read-json-body.test.ts`: tamanho real, Content-Length falso, limite exacto, JSON malformado e sem corpo.
- `tests/security/mobile-login-boundary.test.ts`: autenticação não chamada no excesso, 413, cache proibida em 200/401.

**Sem alterações:** SQL/migrações, perfis, autenticação Supabase, sessões, permissões, RLS, planos de pagamento, frontend, dependências, Cloudflare, WAF, DNS, proxy, balanceamento ou segredos.

### Extensão de implementação — continuação de 02/11/2026

**Alteração C — criação pública de escolas:** `src/routes/api/saas/signup.tsx` usa o leitor limitado de JSON com tecto de **128 KiB**, devolvendo `413` antes de validar ou provisionar uma escola quando o corpo é demasiado grande. Continua a utilizar o mesmo esquema Zod, antirrobô, comprovação de e-mail e limitador partilhado. Todas as respostas (sucesso e erros) recebem `Cache-Control: no-store`: o resultado comercial pode conter ligação de acesso do administrador e nunca deve ser armazenado em cache partilhada.

**Alteração D — receptor de relatórios CSP:** `src/lib/csp.ts` substitui `request.text()` ilimitado pelo leitor de JSON que mede bytes UTF-8 durante a leitura. Mantém as respostas anteriores: `204` para relatório aceite ou inválido, `405` para método incorrecto, `413` para corpo maior que **16 KiB**. Não activa CSP bloqueante nem altera a política de conteúdo.

**Testes desta extensão:**
- `tests/security/public-signup-boundary.test.ts`: payload válido, inválido, grande, no-store e rate limit do negócio (mock, sem gravação).
- `tests/security/csp.test.ts`: prova de rejeição de 20 KiB Unicode real, mesmo quando o comprimento do texto JavaScript é inferior ao limite em bytes.

**Atenção:** a CI de 02/11 foi aprovada no commit `5d7806f87858002adff22fe8636994b8256ad7d6` (**antes** desta extensão). A CI e testes dos novos commits precisam de aprovação própria. Não extrapolar o resultado da execução anterior.

### Extensão de implementação — cache móvel e fallback de rate limiting (02/11/2026)

**Alteração E — dados móveis privados sem cache:** `src/features/mobile/api-response.ts` centraliza `Cache-Control: no-store` em todas as respostas construídas por `mobileRespond` (sucesso, sessão expirada, erro MFA, validação e falha inesperada). O endpoint de login móvel já tem tratamento próprio, implementado nesta PR. `tests/api/mobile-profile.test.ts` agora verifica o cabeçalho em leitura de perfil e validação 422. Importante: outras rotas móveis que construam `Response` directamente precisam de inventário, porque não passam pelo helper central.

**Alteração F — memória do fallback de rate limit:** `src/lib/rate-limit.ts` preserva a janela deslizante e a API existente, mas limpa as chaves expiradas e limita o armazenamento a **50 000 chaves por isolado**. Quando a RPC `siga_rate_limit_consume` não responde e o limite local está saturado, `checkRateLimit` recusa novas chaves (**fail-closed**) para evitar memória sem limite. Esse comportamento pode negar pedidos legítimos durante um ataque de cardinalidade elevada, por isso é obrigação operacional monitorizar a RPC e investigar indisponibilidades, em vez de tratar o fallback como alternativa definitiva. Chaves repetidas num pedido passam a ser deduplicadas. O limite não coordena instâncias diferentes.

**Testes:** `tests/security/rate-limit-fallback.test.ts` cobre expiração, deduplicação, configurações inválidas e saturação. A API mobile tem asserções adicionais nos testes de perfil.

**Histórico de CI:** os runs 41468388110 e 41470484198 falharam por uma única asserção de simulação do erro 429 de signup público (restantes testes, auditoria de dependências e build WEB passaram). A hipótese de rejeição/lançamento mockado foi substituída por uma função de conversão HTTP isolada `publicSignupErrorResponse`, com teste directo do código e cabeçalho. **Confirmar a CI do SHA final desta branch** antes de integrar.

### Extensão de implementação — IP de cliente confiável (02/11/2026)

**Alteração G — evitar falsificação de IP nos limites:** `src/lib/request-ip.ts` agora valida endereços IPv4/IPv6 isolados (sem listas, portas, cabeçalhos compostos, zonas IPv6 ou valores malformados) e normaliza IPv6. Em ambientes distintos de `NODE_ENV=development` ou `NODE_ENV=test`, só aceita `CF-Connecting-IP` válido; a ausência/invalidade devolve a chave partilhada `unknown`, nunca `X-Real-IP` ou `X-Forwarded-For` controlados pelo cliente. Em desenvolvimento/testes, preserva fallback válido para não prejudicar os testes locais.

**Alteração H — uma só política para Server Functions:** `src/lib/server-fn-ip.ts` delega agora em `clientIpFromRequest` em vez de usar `getRequestIP({ xForwardedFor: true })`. `tests/lib/request-ip.test.ts` e `tests/lib/server-fn-ip.test.ts` verificam endereço válido, IPv6, spoofing, ausência de cabeçalho, ambiente desconhecido e fallback de testes.

**Riscos e pré-condições:**
- O identificador `unknown` é uma chave comum de rate limit: se `CF-Connecting-IP` faltar a clientes legítimos em produção, podem ocorrer 429 para vários utilizadores. Antes do merge, verificar em staging o percurso real Cloudflare → Worker, previews, Pages e rotas internas, e medir pedidos sem IP confiável sem guardar endereços nos logs.
- O cabeçalho `CF-Connecting-IP` **não constitui prova criptográfica** de que o pedido veio de uma borda de confiança. A Cloudflare documenta que, em subrequests do mesmo zone Worker, o endereço pode reflectir `x-real-ip` controlado pelo Worker de origem. Confirmar regras de entrada/restrição de Workers, acesso directo à origem e domínio `workers.dev` antes de confiar neste dado para limites de segurança. Nunca usar IP como substituto de sessão, RLS, MFA ou autorização.
- Proteger dados escolares não depende de resolver o IP. A autenticação e as verificações por escola devem continuar obrigatórias mesmo que o IP seja `unknown`.
- Os pedidos HTTP não foram enviados a produção para validar cabeçalhos. A CI da branch deve ser confirmada no **SHA que contém as alterações G/H**, não apenas no SHA `dc74717` (CI anterior **verde**, run `41472471446`: 833 ficheiros de teste, 5.909 testes aprovados, 25 ignorados).

Referência actualizada: https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip-in-worker-subrequests

### Extensão de implementação — sinal operacional do rate limiting (02/11/2026)

**Alteração I — fallback partilhado observável:** `src/lib/shared-rate-limit.ts` emite `console.warn("security.rate_limit.shared_unavailable", ...)` quando a RPC `siga_rate_limit_consume` não responde e o sistema usa a barreira local. Há supressão por **cinco minutos por isolado**, para evitar um evento por pedido durante uma falha. A mensagem tem apenas o nome do evento e o valor constante `fallback: local`: **sem IP, e-mail, chave, hash, token, erro SQL ou payload de pedidos**. A resposta ao utilizador e os limites continuam iguais.

**Testes de regressão:** `tests/security/shared-rate-limit.test.ts` cobre avisos sem PII, intervalo de supressão e ausência de aviso quando a RPC aprova ou recusa. A CI anterior `41475061815` passou com **5.933 testes** no SHA `d69ee0e`; **é obrigatória uma CI própria no novo SHA**.

**Limites e trabalho pendente:** `console.warn` não cria automaticamente alarmes Cloudflare. O próximo agente deve ligar a pesquisa do evento a métricas/alertas operacionais, preferencialmente com agregação e retenção adequadas, sem usar logs de IP de alunos. O aviso limita-se a cada isolado, portanto **não mede o número global de falhas**. Quando a RPC cai, o fallback por isolado não oferece a mesma garantia distribuída; não proclamar limite efectivo idêntico.

**Privacidade:** SHA-256 aplicado a IP/e-mail é **hash sem chave**, não cifragem e não anonimização forte (os possíveis endereços são adivinháveis por dicionário). Manter controlo de acesso e retenção de dados de rate limiting. Uma migração para HMAC com segredo rotativo exige plano de compatibilidade e testes do contador, e fica fora desta PR.

### Fase de homologação — falso verde corrigido (02/11/2026)

**Diagnóstico real da CI:** a execução semanal `41430776705` do workflow `ecosystem-e2e-live.yml` foi classificada como `success`, mas o passo de verificação detectou configuração de staging incompleta e **todos** os passos de setup, preflight, autenticação, Playwright, smoke e E2E @live foram `skipped`. Portanto essa execução **NÃO comprova isolamento multiescola, autenticação nem pagamentos**. Não confundir o verde do agendamento com homologação executada.

**Correcção no workflow:** o passo inicial passa a terminar com código 1 também no agendamento (já falhava na execução manual), com erro explícito e `GITHUB_STEP_SUMMARY` a indicar que E2E não foi executado. Isto transforma a falta de configuração numa falha operacional visível, permitindo a notificação existente. Nenhum teste tenta fazer escrita se faltarem os quatro segredos de staging. `tests/security/e2e-live-workflow-gate.test.ts` valida o YAML, o gate, a rejeição de configuração incompleta e o bloqueio de referência à produção. **Não foram usados dados nem credenciais reais para estes testes unitários.**

**Estado das contas consultadas:** na conta Supabase do SIGA, foi encontrado o projecto de produção SGA activo e um segundo projecto inactivo, sem confirmação de finalidade como staging. **Não se deve reactivar ou usar esse projecto inactivo por suposição.** O workflow exige um projecto isolado explicitamente identificado e credenciais próprias; os segredos do ambiente `staging` não estão completos na execução consultada.

**Cloudflare Workers — visibilidade disponível:** consulta read-only aos metadados de Workers Observability devolveu **0 consultas guardadas e 0 destinos de observabilidade** no âmbito da API consultada; `logpush=false` nas definições do Worker principal. Isso **não demonstra** que Workers Logs estejam desactivados nem que não existam outros mecanismos de alerta. O evento de código `security.rate_limit.shared_unavailable` já foi testado, mas a entrega a um serviço real de alerta/monitorização **continua por provar**.

**Plano de homologação bloqueante para Claude Code:**

1. Confirmar projecto Supabase **de staging independente**, nunca a referência de produção; configurar no ambiente GitHub `staging` exclusivamente os segredos `STAGING_SUPABASE_PROJECT_ID`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY` e `STAGING_SUPABASE_SECRET_KEY`. Não copiar dados pessoais de produção. Verificar `scripts/siga/release-staging-preflight.mjs`.
2. Executar workflow E2E @live manualmente e **confirmar no resumo/steps** que setup, preflight e pipeline autenticado efectivamente correram; um workflow verde com steps ignorados não constitui evidência.
3. Usar duas escolas fictícias A e B e contas de staging distintas (admin A, professor A, aluno B, secretaria B, dual-role A/B, vínculo suspenso); verificar token, troca de `x-siga-school-id`, recusa de acesso B→A, revogação, payloads 400/401/403/429 e isolamento em Financeiro/Notas/RH/Arquivos. Não reutilizar dados reais.
4. Rever `docs/agents/SECURITY_DEFINER_AUDIT_2026-11-02.md` e verificar especialmente `merge_school_subjects` AAL1/AAL2, permissões escolares, parâmetros cruzados, atomicidade, QR de presenças e replay em staging.
5. Simular **apenas em staging**, com injeção controlada, indisponibilidade de `siga_rate_limit_consume` e verificar que o aviso sem PII aparece na plataforma de logs; configurar recepção, limiar e destino de alerta, provar uma notificação e documentar rollback. Não desligar a RPC em produção.
6. Auditar ingressos alternativos `workers.dev`/previews sem alterar DNS, WAF nem origin de produção; verificar os caminhos de cliente e protecção de IP.
7. Anexar ao PR o SHA, IDs dos workflows E2E realmente executados, tabela de resultados por papel/escola e decisão de segurança. **Não fazer merge ou deploy apenas com a CI unitária verde.**

### Defesa em profundidade — preparador do ambiente E2E (02/11/2026)

A CI da fase anterior foi aprovada no SHA `284db625` (run `41479958412`), com **5.942 testes aprovados** e 25 ignorados. Esse resultado confirma o gate estático do workflow, mas **não** substitui um E2E real com staging.

**Alteração J — nenhum @live verde com secret em falta:** `scripts/siga/prepare-ci-env.mjs` passa a sair com erro quando `SIGA_E2E_LIVE=1` ou `true` e `SUPABASE_SECRET_KEY` não foi configurado. Fora do modo live, permanece o skip explícito, para não quebrar verificações locais sem base de dados. Com secret mas sem URL/chave pública, já falhava; mantém-se o bloqueio por `assertSafeE2ETarget` contra a referência da produção antes de escrever `.env`.

**Teste novo:** `tests/security/prepare-ci-env-gate.test.ts` lança o script num processo Node isolado, sem segredos reais nem ligações de rede, e testa os caminhos @live sem secret, não-live sem secret, configuração parcial e referência de produção. Não cria escolas nem credenciais. A CI do SHA que contém esta alteração precisa de aprovação própria.

**Operação real pendente:** a branch Supabase isolada `siga-security-staging-20261102` requer autorização de custo de **US$ 0,01344 por hora** (cotação da API, 02/11/2026). A tentativa de criação sem `confirm_cost_id` foi recusada. **Não foi criada, restaurada nem cobrada nenhuma branch**, e não há autorização expressa de cobrança até agora. Não recolher nem publicar segredos pelo PR. A pesquisa guardada Cloudflare `e17w6yb8t7i11wk2jqg6143i` existe, mas **não é um alerta notificável** até configurar canal, política e ensaio de entrega.

### Defesa do contador partilhado — validação de limites (02/11/2026)

**Alteração K — rejeição prévia de configuração insegura:** `src/lib/shared-rate-limit.ts` valida `windowMs` e `max` como inteiros positivos seguros e compatíveis com o tipo `integer` do PostgreSQL (até 2.147.483.647 segundos/tentativas). Configuração inválida devolve `false` antes da RPC, em vez de confiar numa resposta permissiva do SQL. A migração original `20260927170000_shared_rate_limit.sql` devolve `true` quando `max_hits < 1`; por isso a guarda é necessária no servidor, mesmo que os valores actuais dos endpoints sejam constantes. A consulta ao SQL foi **somente leitura**; não modificar uma migração histórica aplicada nem a produção sem homologação.

**Alteração L — deduplicação por pedido:** a lista de chaves é deduplicada antes de calcular os hashes e entrar na RPC. O SQL já usa `SELECT DISTINCT` ao registar tentativas, e o fallback local usa `Set`. Isto evita locks redundantes quando duas chaves são iguais e mantém o mesmo limite efectivo.

**Regressão:** `tests/security/shared-rate-limit.test.ts` verifica recusa antes da RPC para duração nula, negativa, fraccionária, `NaN`, janela demasiado grande, `max` nulo/negativo/infinito/acima de int32 e deduplicação de chaves. Executar CI completa no **SHA mais recente**; não reportar como aprovado até os jobs terminarem.

**Trabalho futuro para Claude:** rever uma migração **aditiva e versionada** que faça a própria RPC negar ou lançar erro para `max_hits < 1`, `window_seconds < 1` e `key_hashes` nulos/vazios em vez de `return true`; documentar compatibilidade com todos os consumidores, parametrização existente, advisory locks e rollback. Esta revisão SQL exige staging independente e testes de concorrência PostgreSQL real antes de produzir DDL. O guard do servidor não substitui validação na base.

## 4. Validação obrigatória antes de integrar

No checkout desta branch, num ambiente com as dependências instaladas:

```sh
bun install --frozen-lockfile
bunx vitest run tests/security/shared-rate-limit.test.ts tests/lib/request-ip.test.ts tests/lib/server-fn-ip.test.ts tests/security/read-json-body.test.ts tests/security/mobile-login-boundary.test.ts tests/security/public-signup-boundary.test.ts tests/security/csp.test.ts tests/security/rate-limit-fallback.test.ts tests/security/shared-rate-limit.test.ts tests/api/mobile-profile.test.ts tests/api/mobile-login.test.ts tests/saas/ecosystem-cors.test.ts tests/saas/signup-payload-contract.test.ts
npm run typecheck
npm run lint
npm run build
```

Os resultados devem ser registados com SHA e saída de cada comando. **Estes comandos ainda não foram executados pelo agente que abriu a branch**: o ambiente ligado ao GitHub permite leitura/edição remota, mas não disponibiliza checkout integral com dependências. CI deve ser fonte adicional de evidência, nunca prova exclusiva de funcionamento em dispositivos reais.

Confirmar em staging a compatibilidade com a app Flutter e o domínio escolar, incluindo JSON válido, malformado, maior que 16 KiB, 401, 429, 503, tokens e headers de cache. Em produção, limitar-se inicialmente a sondas *read-only* e observabilidade aprovada.

## 5. Ordem de execução recomendada para Claude (não executar sem auditoria)

### P0 — contrato e superfície de ataque

1. Revisar a PR e o CI; resolver falhas antes de combinar.
2. Inventariar todos os endpoints e o domínio de acesso de cada app (SIGA, WEB, ADMIN, DOC e PayFlow), bem como APIs directas do Supabase.
3. Identificar respostas personalizadas ainda sem `no-store`; não aplicar cache público a tokens, dados de alunos ou pagamentos.
4. Auditar SQL dinâmico/RPCs e usar consultas parametrizadas sem concatenar inputs. Confirmar grants, RLS por escola, views security_invoker e SEARCH_PATH de SECURITY DEFINER.
5. Validar os esquemas Zod existentes e limites reais de upload e request nos pontos de entrada mais expostos.
6. Confirmar que as credenciais anteriormente expostas foram revogadas/rodadas, sem as copiar para logs, PRs ou relatórios.

### P1 — protecção de perímetro

7. Verificar regras WAF, protecção DDoS, bots e rate limit **na zona real**; documentar IDs e estados sem expor tokens.
8. Distinguir tráfego do domínio Cloudflare das APIs externas directamente expostas (Supabase/Auth/Storage); um WAF da zona não protege automaticamente um endpoint terceiro.
9. Rever `src/lib/request-ip.ts` e `src/lib/server-fn-ip.ts`: em produção não confiar em X-Forwarded-For ou X-Real-IP fornecidos livremente pelo cliente; desenhar confiança por proxy e ensaiar NAT escolar/mobile. Evitar solução que agrupe inadvertidamente todos os alunos em `unknown`.
10. Medir eficácia da RPC de rate limit e comportamento de fallback, incluindo cardinalidade elevada e incidentes de indisponibilidade do banco. Definir métricas, orçamento de memória e decisão de fail-open/fail-closed por endpoint.
11. Auditar DNS A/AAAA/CNAME/TXT/MX, wildcard e rotas Pages/Workers; não fazer alterações antes de exportar configurações e dependências de hostname.
12. Verificar TLS Full (strict), HSTS/subdomínios, CSP Report-Only e estratégia progressiva para CSP bloqueante, sem comprometer OAuth, PDFs ou app móvel.

### P2 — disponibilidade e observabilidade

13. Verificar `x-request-id` nas APIs e correlacionar com logs do Worker, auth, RPC e PayFlow sem registar PII.
14. Definir SLOs e alertas para 5xx, p95/p99, falhas de login, 429, pagamentos, webhooks e indisponibilidade.
15. Examinar necessidade de balanceador real: Workers/Pages já distribuem execução; só propor pools/failover se houver múltiplas origens verificadas.
16. Verificar backups, restauração em staging isolado e rollback de deploy.
17. Mapear custo/limites do plano Cloudflare e Supabase antes de adicionar recursos pagos.

## 6. Critérios de aceitação por PR

- Mudanças pequenas e reversíveis, com testes específicos e sem quebra de APIs existentes.
- Nenhum bypass de MFA ou autorização para fazer passar testes.
- Prova negativa de isolamento: uma escola não acede a dados de outra.
- Métricas antes/depois; não proclamar desempenho melhor sem medir.
- Testes de segurança automatizados + verificação em staging isolado.
- Inventário actualizado de pendências com P0/P1/P2, responsável e evidência.
- Merge apenas depois de revisão, CI e confirmação do risco de deploy automático.
- Registar o SHA exacto da branch, commit integrado, workflows e versão publicada; nunca declarar deploy por suposição.

## 7. Instrução explícita ao Claude Code

> Continua a implementação de segurança do SIGA Plus a partir da branch `security/phase1-api-input-cache-20261102`. Começa por comparar com a `main`, ler este handoff e executar os testes e validações pendentes. Preserva todas as funcionalidades. Não mistures alterações com PRs abertas de CRUD, financeiro ou websites escolares. Segue as regras da base SGA de produção. Depois implementa P0/P1 em PRs pequenas e sequenciais, com diagnóstico, testes, documentação e rollback. Não faças deploy nem changes em DNS, WAF, RLS ou produção sem aprovação explícita de cada mudança de infraestrutura.

## 8. Referências externas consultadas

- Supabase security checklist e RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Cloudflare WAF rate limits: https://developers.cloudflare.com/waf/rate-limiting-rules/
- Cloudflare Workers rate limiting: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- OWASP input validation: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

**Não confundir os estados "código encontrado", "testado", "activo em produção" e "pendente".**
