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

- [Primeiros passos](/siga/primeiros-passos) — o que fazer depois de criar a escola
- [Papéis, acessos e segurança](/siga/papeis-e-acessos) — papéis, permissões e verificação em dois passos
- [Alunos e matrículas](/siga/alunos-e-matriculas) — matrícula interna, online e importação
- [Área pedagógica](/siga/area-pedagogica) — notas, pautas oficiais e chamada
- [Financeiro escolar](/siga/financeiro-escolar) — facturas, recibos, caixa e pagamentos
- [RH e assiduidade](/siga/rh-e-assiduidade) — folha salarial e presença do professor por QR
- [Documentos e comunicações](/siga/documentos-e-comunicacoes) — documentos oficiais, verificação e comunicados
- [Catracas e arquivos](/siga/catracas-e-arquivos) — cartões, controlo de entrada e biblioteca
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
