# Responsabilidades

## WEB — vende

Landing, funcionalidades, planos, preços, demonstração, contacto, FAQ,
início de trial e **criação de escola**. O visitante ainda não é utilizador
do produto escolar. O wizard usa o design do WEB.

Não gere alunos, notas nem o painel SaaS global.

## ADMIN — controla

Verdade administrativa: tenant, escola, subscrição, plano, domínio, uso,
billing SaaS, provisionamento e estado (trial, activo, suspenso).

Não gere pautas, propinas de alunos nem o dia-a-dia da instituição.

O **administrador da plataforma** (`platform_admins`) é distinto do
**administrador escolar** (Diretor, Secretário, Tesoureiro no SIGA).

## SIGA Plus — trabalha

Operação da escola já criada: alunos, professores, turmas, avaliações,
pautas, presenças, documentos, calendário, comunicações, arquivos, catracas
e **financeiro escolar** (propinas, recibos, caixa da instituição).

Não vende o SIGA, não gere tenants globais, não cobra a assinatura da
plataforma. Links de planos / upgrade abrem o WEB. Ajuda abre este DOC.
Cobrança de propinas abre o **PayFlow**.

## PAYFLOW — cobra

Pagamentos, referências, recibos e conciliação. Recebe identidade e
obrigações do SIGA; não recadastra alunos nem escolas. Marca visual própria
(favicon/azulejos azuis) — nunca o logótipo do SIGA.

O painel `/admin` do PayFlow abre por SSO a partir da tesouraria SIGA.
O ADMIN SaaS só vê o **health** da camada — sem faturas escolares.

## DOC — explica

Manuais, APIs, arquitectura, integrações, changelog e políticas.
Consultável a partir das outras aplicações; continua independente.

## Dois financeiros

| Tipo | Fluxo | Onde |
| --- | --- | --- |
| Escolar | Aluno → propina → escola | SIGA cria a obrigação; PayFlow cobra e emite o recibo |
| Billing SaaS | Escola → assinatura → plataforma | ADMIN / WEB |

## Multi-tenant

Uma aplicação, uma base de dados, N tenants, N escolas. Não se cria um
PostgreSQL por escola. Cada escola acede pelo seu hostname e vê só os seus
dados.
