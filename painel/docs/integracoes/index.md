# Integrações

Manuais para ligar serviços externos ao SIGA Plus.

| Integração | Onde configurar | Manual |
| --- | --- | --- |
| Multicaixa Express (EMIS) | SIGA → Definições → Integrações | [EMIS / Multicaixa e Unitel](/integracoes/emis-multicaixa-unitel) |
| Unitel Money | SIGA → Definições → Integrações | [EMIS / Multicaixa e Unitel](/integracoes/emis-multicaixa-unitel) |
| Go-live produção | Operador + escola + portal banco | [Checklist produção](/integracoes/gateway-producao) |
| Pedido ao banco (EMIS/Unitel) | Escola + gestor contrato | [Modelo portal banco](/integracoes/gateway-portal-banco) |
| Incidentes webhook | Suporte / tesouraria | [Runbook suporte](/integracoes/gateway-runbook-suporte) |
| Observabilidade webhook | Operador plataforma | [Runbook § Observabilidade](/integracoes/gateway-runbook-suporte#observabilidade) · ADMIN `/gateway-webhooks` |

Cada escola tem **entidade EMIS** e **API key de webhook** próprias — não partilhe credenciais entre tenants.
