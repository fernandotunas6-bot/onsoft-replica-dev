# WEB, ADMIN, PAYFLOW e DOC

08/10/2026. Aplicações e identidade visual conservadas. Banco escolar continua o SGA actual; D1 do PayFlow tem responsabilidade de cobrança própria, sem recadastrar alunos/matrículas.

| App | Objectivo e perfis | Fluxo e fonte | Estado / dependências |
| --- | --- | --- | --- |
| WEB | Visitante conhece planos e cria instituição | `/start` recolhe instituição/responsável/estrutura/plano/conta/subdomínio/revisão → API SaaS → confirmação | Código implementado; só início/validação vazia verificados no browser da auditoria. Provisionamento integrado bloqueado sem staging. |
| ADMIN | `platform_admins` gerem tenants, planos, domínios e SaaS | Gate cliente para UX; autorização real `requirePlatformAdmin*` nas APIs SIGA | Exportação estática: middleware Next não protege o artefacto publicado. Não atribuir privilégio global por cargo escolar. |
| PAYFLOW | Pagador autorizado e tesouraria cobram obrigações SIGA | Obrigações/saldo vêm do SIGA → pedido ao provider → confirmação backend/webhook → liquidação/recibo → reconciliação | Health observado: D1 disponível; provider, SSO e ligação/liquidação SIGA desconfigurados. Testes locais passam, integração real não certificada. |
| DOC | Visitante/pessoal lê documentação | Ajuda contextual por domínio → manual funcional/contrato/API | VitePress público; conteúdo e links devem reflectir estado implementado/proposto, sem expor segredos. |

## Contratos e dados

Campos e validações comerciais vêm de `src/features/saas/schemas.ts` e `painel/web/src`; tenant/escola/vínculos/subscrição/domínio seguem tabelas actuais. APIs ADMIN em `src/routes/api/saas*` verificam identidade global independentemente da interface. PayFlow contratos estão em `docs/agents/PAYFLOW_INTEGRATION.md` e `painel/payflow`; não marcar pago por redirect/browser.

URLs vêm de módulos `ecosystem-urls` de cada app e env; redirecções têm allowlist. Contexto autorizado sem tokens nas query strings. Estados SaaS e financeiro são os enums efectivos dos contratos, não novo estado partilhado criado nesta SPEC.

## Fluxos alternativos e UI

Wizard preserva dados se validação/provisionamento falhar; sucesso só com criação confirmada; dependência de e-mail não inventa entrega. Duplicação/reenvio e rollback de signup exigem verificação em staging. ADMIN mostra acesso negado, erro de API e vazio como estados distintos. PayFlow falha fechado sem provider homologado e distingue transferência manual de integração bancária automatizada. DOC explica pré-requisitos e limites sem prometer função ausente.

Desktop/mobile preservam design por aplicação, labels/foco e acção primária previsível. Listas com filtros/paginação/estado do pedido; mudanças de tenant não conservam dados privados do anterior. Autenticação partilhada não implica componentes visuais partilhados.

## Aceitação, riscos e decisões

WEB→API→tenant/escola/conta→ADMIN→SIGA, reenvio/falha a meio sem duplicação, configuração inicial completa e persistência. ADMIN sem `platform_admins` recebe recusa também por API. Pagamento sandbox confirma saldo/recibo/portal; webhook repetido/estorno reconciliam. Documentação corresponde à versão publicada rastreável.

**Por decidir:** fornecedor e homologação PayFlow, credenciais sandbox, SSO/liquidação, staging, política de subscrição/suspensão sem registo documental suficiente. Sem pagamentos ou mensagens reais nos testes. Audit logs e métricas só com evento confirmado e actor autorizado.

[SPEC SaaS](modules/saas.md) · [SPEC Financeiro](modules/finance.md) · [Índice](README.md)
