# SIGA — gestão escolar

Manual operacional da aplicação **SIGA** (TanStack Start, `:3006`).

O SIGA é onde a escola trabalha: alunos, pedagógica, tesouraria, documentos, arquivos, catracas e definições locais.

## Ecossistema

| App | Papel |
| --- | --- |
| **WEB** | Vende planos e wizard de criação de escola |
| **ADMIN** | Control Center SaaS (tenants, subscrições, domínios) |
| **SIGA** | Operação diária da instituição |
| **DOC** | Manuais e arquitectura (este site) |

Ver também [Arquitetura do ecossistema](/arquitetura/).

## Onde começar

- [Mapa de navegação](/siga/navegacao) — sidebar, launcher e permissões por papel
- [Ensino Superior](/siga/ensino-superior) — cursos, planos com créditos, inscrições por cadeira e épocas
- [Funcionalidades](/guide/features) — visão geral dos módulos
- [Integrações](/integracoes/) — Multicaixa, WhatsApp, Resend, AGT

## Rotas públicas

- `/matricula/{slug}` — candidatura online (partilhada no dashboard após bootstrap)
- `/criar-escola` — ponte para o wizard WEB (comercial)

## Pontes SaaS (não substituem o ADMIN)

- `/saas-admin` — redirecciona para documentação e Control Center
- APIs em `/api/saas/*` — consumidas pelo WEB e ADMIN
