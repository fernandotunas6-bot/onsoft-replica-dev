# Integração PayFlow no SIGA Plus

O PayFlow é a quinta aplicação do monorepositório e vive em `painel/payflow`.
Ele mantém frontend, runtime e armazenamento próprios para que a equipa possa evoluir
o produto financeiro sem acoplar o seu ciclo de desenvolvimento ao frontend académico.

## Limites de responsabilidade

| Domínio | Fonte de verdade | Responsabilidade |
| --- | --- | --- |
| Escola, tenant e ano letivo | SIGA Plus | Identidade institucional e contexto ativo |
| Aluno e matrícula | SIGA Plus | Identidade académica, turma e vínculo escolar |
| Plano e obrigação financeira | SIGA Plus | Regra que determina o que deve ser cobrado |
| Tentativa e estado do pagamento | PayFlow | Orquestração, referência, provedor e transições |
| Conta bancária da escola | SIGA Plus | Cadastro institucional sincronizado com o PayFlow |
| Comprovativo de transferência | PayFlow | Evidência privada para revisão; nunca confirmação isolada |
| Recibo do pagamento PayFlow | PayFlow | Emissão e verificação após confirmação real |
| Billing da assinatura SaaS | ADMIN/WEB | Escola como cliente do SIGA; não é propina escolar |

Não duplicar cadastros académicos no PayFlow. A integração deve sempre transportar
`tenant_id`, `school_id`, `student_id`, `enrollment_id` quando aplicável e o ID académico
visível de exatamente 7 dígitos. UUIDs permanecem internos.

## Execução local conjunta

Instale as dependências da raiz e de cada aplicação, incluindo o PayFlow:

```sh
npm ci --prefix painel/payflow
npm run dev:ecosystem
```

Portas:

| Aplicação | Porta |
| --- | ---: |
| ADMIN | 3005 |
| SIGA Plus | 3006 |
| PayFlow | 3007 |
| DOC | 5173 |
| WEB | 5174 |

`npm run siga:sync-env` cria também `painel/payflow/.env.local` sem imprimir segredos.

## Contrato inicial SIGA → PayFlow

`POST /api/v1/education/sync` recebe escola, aluno e faturas. É uma integração
servidor-a-servidor protegida por `PAYFLOW_INTEGRATION_API_KEY`; a chave nunca deve chegar
ao browser nem usar prefixo `VITE_` ou `NEXT_PUBLIC_`.

No SIGA, a server function `syncStudentToPayflow` (botão **Sync PayFlow** no modal extensivo
do aluno → aba Financeiro) monta o payload a partir de:

- `schools` + `tenant_id`
- matrícula activa (`enrollments` + turma + ano)
- faturas do contrato (`finance_invoices`, valores em cêntimos)
- IBAN institucional (Definições → Financeiro)
- código público de 7 dígitos e PIN estável derivados de forma determinística

O SIGA continua responsável pela criação da obrigação. O PayFlow não deve alterar turma,
matrícula, ano letivo nem identidade do aluno.

## SSO administrativo SIGA → PayFlow

`createPayflowAdminLaunch` assina um JWT HMAC (`PAYFLOW_SSO_SECRET`, ≥32 chars) com
`iss=siga-plus` / `aud=payflow`. O browser faz POST form para
`/api/v1/sso/exchange` (anti-replay por `jti`) e recebe cookie HttpOnly + redirect 303
para `/admin`. O login por chave em `/api/v1/admin/login` fica reservado a sandbox /
integração — não aceita `sso_assertion`.

## Estado de produção

O runtime usa `PAYFLOW_RUNTIME_MODE=production` por omissão. Nesse modo:

- não carrega dados, métricas, credenciais ou utilizadores de demonstração;
- recusa integração se a chave do servidor estiver ausente ou for demasiado curta;
- recusa tentativas EMIS até existir um adaptador homologado;
- permite transferência somente quando a conta IBAN correspondente está ativa;
- desativa rotas que confirmam pagamentos a partir do navegador;
- nunca interpreta redirect do browser como confirmação financeira;
- nunca interpreta um comprovativo enviado pelo pagador como dinheiro recebido;
- mantém recibos condicionados ao estado confirmado pelo backend/provedor.

## Transferência por IBAN enquanto a EMIS não está configurada

Existem dois escopos de conta, ambos sincronizados por API autenticada:

- `platform`: recebe a compra de pacotes e assinaturas feita pela escola;
- `school`: recebe propinas, matrículas e serviços filtrados do aluno.

O pagamento nasce `pending` com referência única. O pagador recebe beneficiário, banco, IBAN,
valor exato e validade. O comprovativo é enviado para o R2 privado `TRANSFER_PROOFS` e muda apenas
o estado operacional para `proof_submitted`.

`POST /api/v1/bank-transfers/verify` aceita somente movimentos autenticados e exige coincidência
de referência, valor e moeda. As fontes permitidas são `bank_api`, `bank_statement` e
`manual_review`; nesta última, deve existir comprovativo e o operador deve ter conferido o
extrato real. O mesmo `bank_transaction_id` não pode liquidar dois pagamentos. A atualização do
pagamento, fatura, auditoria e recibo é executada em lote atómico.

O `emis_sandbox` existe somente para desenvolvimento local e exige
`PAYFLOW_RUNTIME_MODE=sandbox` explícito. Não ativar esse modo em staging com dados reais
nem em produção.

## Próxima fatia de integração

Antes de ativar tráfego real:

1. sincronizar as contas bancárias reais da plataforma e das escolas — **Sync IBAN → PayFlow** em Definições → Financeiro (upsert escola+conta);
2. escolher e configurar a fonte de movimentos: API bancária ou importação de extrato;
3. ~~definir papéis para revisão manual~~ — `manual_review` exige `finance_admin` + comprovativo;
4. obter contrato, documentação, credenciais e homologação da EMIS;
5. ~~ligar SSO admin~~ — feito (`createPayflowAdminLaunch` + `/api/v1/sso/exchange`);
6. executar testes de isolamento entre escolas e reconciliação ponta a ponta;
7. configurar observabilidade, alertas e procedimento de reversão.

Não apagar o financeiro existente do SIGA antes de o novo fluxo ter paridade, migração
validada e rollback documentado.
