# ISPAB — website existente, entrega Kursinha e passagem controlada a produção

## Destinos existentes (não criar outra escola ou outro domínio)

- Domínio principal do website e do portal escolar, já activo: `https://ispab.portal-siga.com/`
- Portal SIGA autenticado: `https://ispab.portal-siga.com/portal?escola=ispab`
- Página de propinas no website integrado: `https://ispab.portal-siga.com/site/propinas/`
- **URL para colar no campo “Entrega → Link de acesso” da Kursinha**:
  `https://ispab.portal-siga.com/site/propinas/confirmacao/`

A página de entrega é informativa, **não confirma pagamentos**. Não recolhe dados privados nem credenciais e não muda saldos ou emite recibos. Não criar outro tenant ou domínio. O website integrado é servido pelo Worker SIGA em `/site/...`, no hostname escolar já validado. O projecto Pages `siga-ispab` é uma cópia adicional existente, mas **não será o destino público da Kursinha**.

## Limites operacionais confirmados em 31/10/2026

- O tenant ISPAB existe, mas está cadastrado como **ISPAB (Demonstração)**, com NIF fictício, e-mail `.invalid`, campo `school_settings.demo.isDemo=true` e facturação da plataforma pausada.
- A publicação da aplicação SIGA pela workflow `.github/workflows/deploy-production.yml` serve o website integrado em `ispab.portal-siga.com/site/...`. A workflow `.github/workflows/siga-ispab-cloudflare.yml` continua a manter a cópia Pages `siga-ispab`.
- O website contém catálogo, dados editoriais e funcionalidades de simulação, que **não podem ser apresentados como dados académicos verdadeiros**.
- O PayFlow não pode liquidar automaticamente cobranças EMIS em produção: o adaptador de produção continua indisponível até à homologação.
- O material público da Kursinha anuncia webhooks, mas é indispensável obter **especificação autenticada de eventos, assinatura, política de reenvio e API de verificação** do fornecedor antes de habilitar liquidação de propinas.

## Critérios obrigatórios para retirar a demonstração

1. Confirmar autorização da instituição ISPAB e dados oficiais: nome legal, NIF, morada/província, contactos, responsável institucional, referências de autorização, contas financeiras e política de privacidade. O proprietário deve actualizá-los pelos fluxos administrativos autorizados; **não inventar dados**.
2. Confirmar que cursos, preços, calendário, inscrições e conteúdos públicos foram validados e publicados no SIGA. Desactivar referências e formulários de demonstração apenas quando a ligação oficial estiver operativa, sem converter dados locais fictícios em dados de produção.
3. Associar a conta administradora real, MFA e papéis de secretaria/tesouraria com privilégios mínimos. Confirmar que não existem sessões demonstrativas com acesso a contas reais.
4. Configurar propriedade da conta Kursinha do ISPAB, produtos de propinas por competência e ligação determinística à factura do estudante, sem usar nome/e-mail como única chave. **Nunca** activar pagamento por uma URL estática.
5. Implantar evento de pagamento `paid` validado no servidor: verificar assinatura e, quando suportado, consultar a API de confirmação do fornecedor; validar `order_id`, `transaction_id`, `school_id`, `invoice_id`, moeda, montante e beneficiário; rejeitar repetições; aplicar registo único da transacção com idempotência e auditoria. Reconhecer reembolsos, estornos, falhas e pagamentos parciais. Não liquidar por redireccionamento no navegador.
6. Executar testes de ponta a ponta com transacções de ensaio, reconciliação de pagamentos, permissões RLS, isolamento entre escolas, reversões, falta de rede e dispositivo móvel. Confirmar lançamento operacional e mecanismos de suporte e rollback antes da primeira cobrança.
7. Só depois actualizar `schools`, `tenants`, a configuração pública e o modo de demonstração, de forma transaccional e auditável. **Não alterar a isenção de cobrança SaaS** sem decisão explícita da administração.

## Validações desta entrega

- `cd painel/escolas && npm run build && npm run check && npm test`
- Inspeccionar `dist/propinas/index.html`, `dist/propinas/confirmacao/index.html` e `dist/school-runtime.json`.
- Após publicar, confirmar respostas HTTP 200 e links em `ispab.portal-siga.com/site/propinas/` e `/site/propinas/confirmacao/`; não assumir que um commit no GitHub significa publicação.
- No campo da Kursinha introduzir o URL acima **apenas depois da confirmação do deployment**. Usar compra de teste sem valor real para validar navegação antes de vender.

## Fluxo único de estudante, secretaria e finanças

O site oficial (mesmo tenant `ispab`) apresenta a candidatura e a página de entrega. Para um **estudante matriculado**, a sequência obrigatória é:

1. A Secretaria valida o processo `enrollment_applications` com o número do candidato, decide a candidatura e cria/associa `students`/`enrollments` pelas funções existentes, sem duplicar pessoa, estudante ou matrícula.
2. A Tesouraria associa `finance_contracts` à matrícula e emite uma `finance_invoices` específica da propina (competência, montante e escola). Esta ligação não é inferida a partir do nome ou e-mail do comprador.
3. A ordem de checkout da Kursinha precisa transportar uma referência opaca que permita ao servidor reconciliar a fatura previamente emitida; o fornecedor deve expor uma API para verificar no **servidor** o pagamento real e o beneficiário. Enquanto não houver esse contrato/API homologado, a confirmação automática permanece **desactivada**.
4. Só um evento comprovado no fornecedor, com montante, moeda AOA, referência, ID único e correspondência exacta de fatura/escola, pode lançar `finance_receipts` e actualizar o estado da fatura usando os mecanismos de liquidação já existentes do SIGA, com idempotência e auditoria. Eventos duplicados ou estornados não podem produzir saldos fictícios.
5. A Secretaria visualiza a candidatura e a matrícula existentes, a Tesouraria consulta a fatura/recibo existentes, e o aluno consulta as mesmas operações no seu portal autenticado, inclusive pagamentos parciais e estornos. **Não criar outro livro de propinas nem outro aluno**.
6. Depois do checkout, a entrega abre `/site/propinas/confirmacao/` e em seguida `/portal?escola=ispab&vista=estudante&seccao=financeiro`. O encaminhamento não declara pago; no portal são mostradas apenas as operações efetivamente registadas. Quem ainda não foi aprovado ou não tem conta deve contactar a Secretaria; não receber autorização por ter aberto o link.

**Separação importante:** pagamento de candidatura por um candidato **não equivale a propina de estudante matriculado**. A Secretaria valida admissão e autenticação académica. Nenhum pagamento desbloqueia conta, emite número de matrícula, nem altera notas ou documentos académicos sem essas regras.

## Situação da implementação

- O retorno para o portal financeiro do estudante foi preparado no website integrado.
- A página financeira autenticada foi ligada a `enrollments → finance_contracts → finance_invoices → finance_receipts`, só para o próprio aluno/escola, sem copiar dados para outra tabela.
- **Não se pode declarar a automatização Kursinha → caixa activa** sem payload, assinatura ou consulta oficial do pagamento, credenciais de produção e ensaios reais. As funcionalidades de inscrição, validação e emissão de recibos continuam nos respectivos módulos SIGA.
