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

## 4. Validação obrigatória antes de integrar

No checkout desta branch, num ambiente com as dependências instaladas:

```sh
bun install --frozen-lockfile
bunx vitest run tests/security/read-json-body.test.ts tests/security/mobile-login-boundary.test.ts tests/security/public-signup-boundary.test.ts tests/security/csp.test.ts tests/security/rate-limit-fallback.test.ts tests/security/shared-rate-limit.test.ts tests/api/mobile-profile.test.ts tests/api/mobile-login.test.ts tests/saas/ecosystem-cors.test.ts tests/saas/signup-payload-contract.test.ts
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
