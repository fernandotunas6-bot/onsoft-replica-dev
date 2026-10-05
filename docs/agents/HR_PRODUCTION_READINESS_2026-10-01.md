# RH — estado de preparação para produção (01/10/2026)

Conjunto da PR #62: confirmação salarial e destino bancário/auditoria transaccionais, máscaras de contas/referências, estados canónicos, datas/horas válidas, detalhe histórico da folha, revisão persistida de faltas com 2FA e erros de leitura explícitos.

## Estado concreto

- Ambas as migrações aditivas foram aplicadas ao SGA. Wrappers INVOKER e helpers privados conferidos no catálogo, chamadas sem identidade recusadas; nenhum pagamento/destino de teste inserido na produção.
- O código está na branch fix/hr-atomic-confirmation-20260930, PR #62. A base main foi confirmada em 1ff0e4fad0d13413cbc1121dd45cca2757179056 e a PR não apresentava conflitos. O código da PR ainda não foi integrado nem publicado.
- 2.390 testes aprovados, 19 ignorados; 349 ficheiros aprovados, três ignorados. Verificação de tipos, lint global, build de produção e siga:check aprovados.
- Ensaios SQL PGlite de confirmação e destino aprovados: rollback com falhas injectadas, reenvios, MFA, grants, escola, valor/beneficiário, política manual, máscaras e privilégios.

## Limites ainda por validar

Os testes do handler simulam conflitos; concorrência real entre sessões PostgreSQL não foi ensaiada. A aceitação do fluxo completo com utilizadores reais (Admin/Tesouraria e 2FA) exige ambiente apropriado. Os testes externos ignorados não equivalem a validação dos serviços externos.

A confirmação manual regista o pagamento no SIGA; não executa transferência bancária. Não se certificaram tabelas legais IRT/INSS nem catálogo salarial oficial nesta alteração. Não recalcula folhas já aprovadas.

## Publicação

A última execução consultada, 36764312378 de 30/09, validou o código de main, mas falhou antes de publicar por falta dos seguintes secrets no ambiente GitHub production:

- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SERVICE_ROLE_KEY

O conector GitHub não permite administrar secrets. Não foram inventados valores nem lançadas novas Actions. A integração e a publicação devem usar o conjunto revisto e validado, com as credenciais configuradas no ambiente de produção.
