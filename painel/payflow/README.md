# PayFlow Connect

Aplicação de pagamentos do ecossistema SIGA Plus.

## Estrutura

O PayFlow fica isolado do frontend escolar principal e serve checkouts públicos na rota /checkout/:checkoutId.

A aplicação não contém IBAN, titular, banco, credenciais EMIS ou dados de demonstração hardcoded. Esses dados devem ser fornecidos pelo backend de pagamentos.

## Desenvolvimento

1. Entrar em painel/payflow.
2. Executar npm install.
3. Executar npm run dev.
4. Abrir http://localhost:3007.

## Variáveis públicas

- VITE_PAYFLOW_URL
- VITE_PAYFLOW_API_BASE
- VITE_SUPABASE_URL (opcional)
- VITE_SUPABASE_PUBLISHABLE_KEY (opcional)

Nunca colocar service_role, sb_secret_ ou credenciais bancárias privadas em variáveis VITE_*.

## Contrato mínimo do backend

- GET /api/payflow/checkouts/:id
- POST /api/payflow/checkouts/:id/bank-transfer
- GET /api/payflow/checkouts/:id/status
- POST /api/payflow/checkouts/:id/proof

A criação da transferência deve devolver uma referência única e manter o pagamento como pending.

O upload do comprovativo não pode confirmar pagamento sozinho. O estado só deve mudar para paid após conciliação bancária ou revisão autorizada. A conciliação deve validar referência, valor e moeda e impedir a reutilização do mesmo movimento bancário.

## Integração SIGA

O SIGA/Web cria o checkout no backend e redireciona o utilizador para VITE_PAYFLOW_URL + /checkout/ + checkoutId.

Dessa forma o PayFlow pode ter domínio e deploy próprios, mas continua a partilhar o tenant, a identidade e a fonte financeira do SIGA Plus.
