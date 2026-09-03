# PayFlow

Aplicação financeira do ecossistema SIGA Plus. Esta pasta é executada como uma aplicação
independente no monorepositório, em `painel/payflow`, para preservar a separação entre o
domínio académico e o domínio financeiro.

## Responsabilidades

- receber escolas, alunos e cobranças sincronizados pelo SIGA Plus;
- oferecer o portal público do pagador em `/aluno/pagar`;
- iniciar e acompanhar pagamentos através de adaptadores de provedor;
- gerar instruções de transferência por IBAN para assinaturas da escola e serviços do aluno;
- receber comprovativos em armazenamento privado e reconciliar movimentos bancários;
- emitir e validar recibos;
- manter referências técnicas separadas para escola, aluno, fatura, pagamento, transação e recibo.

O SIGA Plus continua como fonte de verdade académica. O PayFlow é responsável pelos estados
financeiros criados depois da sincronização.

## Segurança de produção

O modo padrão é `production` e opera de forma fechada:

- não existem utilizadores, PINs, cobranças ou métricas de demonstração no código;
- a chave de integração é lida somente de `PAYFLOW_INTEGRATION_API_KEY` no servidor;
- rotas de integração recusam pedidos quando a chave não está configurada;
- pagamentos EMIS são recusados enquanto não existir um adaptador real homologado;
- transferências funcionam somente quando existe uma conta bancária ativa e sincronizada;
- o navegador não pode confirmar ou marcar um pagamento como pago em produção;
- enviar um comprovativo nunca equivale a confirmar a entrada do dinheiro;
- um redirecionamento do provedor nunca equivale a uma confirmação financeira.

O adaptador `emis_sandbox` permanece disponível apenas para desenvolvimento local quando
`PAYFLOW_RUNTIME_MODE=sandbox` é definido explicitamente. Nunca use esse modo num ambiente
com dados ou tráfego reais.

## Ambiente

Copie `.env.example` para `.env.local` e configure apenas os valores necessários. Não grave
segredos no repositório.

```dotenv
PAYFLOW_RUNTIME_MODE=production
PAYFLOW_INTEGRATION_API_KEY=<segredo-servidor-com-pelo-menos-24-caracteres>
PAYFLOW_SIGA_URL=http://localhost:3006
PAYFLOW_TRANSFER_EXPIRY_HOURS=72
```

As credenciais EMIS somente poderão ser ativadas depois da contratação, documentação técnica
e homologação fornecidas pela EMIS, PSP ou PST-SP aplicável. Até lá, pagamentos reais podem
usar transferência por IBAN. A conta da plataforma recebe assinaturas/pacotes SaaS; a conta da
escola recebe cobranças dos alunos. Os IBANs são sincronizados pelo backend e nunca ficam
gravados no frontend.

## Fluxo de transferência

1. O PayFlow cria um pagamento `pending` com valor, moeda e referência únicos.
2. O pagador transfere para o IBAN apresentado e pode enviar um comprovativo PDF ou imagem.
3. O comprovativo é guardado no binding R2 privado `TRANSFER_PROOFS`; não torna o pagamento pago.
4. O backend reconcilia a referência, o valor e a moeda com um movimento vindo da API bancária,
   extrato importado ou revisão autorizada no próprio extrato.
5. Somente depois da correspondência exata o pagamento e a fatura são atualizados e o recibo
   verificável é emitido.

Sem acesso à API ou ao extrato da conta bancária, o sistema não pode provar automaticamente
que uma transferência ocorreu. Uma imagem enviada pelo cliente é evidência para revisão, não
confirmação financeira.

## Desenvolvimento

Requisitos: Node.js 24 e as dependências instaladas com `npm ci`.

```bash
npm run dev
npm run lint
npm test
npm run build
```

O servidor local usa a porta `3007`. A aplicação necessita do binding D1 `DB`, declarado em
`.openai/hosting.json`; as migrações estão em `drizzle/`.

## Endpoints principais

- `GET /api/v1/health` — estado público e seguro da configuração;
- `POST /api/v1/education/sync` — sincronização SIGA → PayFlow, autenticada no servidor;
- `POST /api/v1/bank-accounts/sync` — sincronização de contas da plataforma ou da escola;
- `POST /api/v1/bank-transfers/verify` — reconciliação autenticada de movimento confirmado;
- `POST /api/v1/student/session` — acesso do pagador com código da escola, ID de 7 dígitos e PIN;
- `GET|POST /api/v1/student/payments` — histórico e início de pagamento no escopo da sessão;
- `POST /api/v1/student/payments/:id/proof` — comprovativo privado no escopo do aluno;
- `POST /api/v1/checkout/:token/proof` — comprovativo privado no checkout de uma assinatura;
- `GET /api/v1/receipts/:code` — validação pública de comprovativo com dados pessoais mascarados.

As rotas administrativas e integrações devem continuar protegidas no backend; esconder um
botão no frontend não substitui autorização.
