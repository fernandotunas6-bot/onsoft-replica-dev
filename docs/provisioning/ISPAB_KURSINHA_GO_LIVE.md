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
