# Site público (ADMIN → Site)

O site comercial (`painel/web`) tem quatro partes geridas no ADMIN, no grupo **Site** do
menu. Só administradores da plataforma, com 2FA, entram nestas páginas.

| Página | O que faz | No site |
| --- | --- | --- |
| **Blog** (`/site/blog`) | Escrever, publicar, arquivar e apagar artigos. Só os publicados aparecem. | `/blog`, `/blog/<endereço>` e os três últimos na página inicial |
| **Perguntas do site** (`/site/faqs`) | Criar, ordenar, esconder e apagar perguntas. As marcadas «Na página inicial» aparecem na página inicial. | Página inicial e `/faqs` |
| **Mensagens de contacto** (`/site/messages`) | Ler o que as escolas escrevem no formulário, responder por e-mail e marcar como respondida ou arquivada. | Formulário «Escreva-nos» |
| **Escolas no site** (`/site/schools`) | Ver que escolas aceitaram aparecer e esconder uma, se for preciso. | «Escolas que usam o SIGA Plus» |

## Escrever um artigo

O texto aceita parágrafos (linha em branco entre eles), `## Título`, listas com `- ` ou
`1. `, `**negrito**`, `*itálico*` e ligações `[texto](https://…)`. HTML não é interpretado:
aparece como texto. O endereço gera-se a partir do título, se ficar em branco. A data de
publicação é a da primeira vez que o artigo é publicado.

## Escolas que usam o SIGA Plus

Uma escola só aparece se:

1. o **Administrador da escola** ligar, no SIGA, **Definições → Escola → Mostrar a escola no
   site SIGA Plus** (desligado por defeito);
2. a escola estiver activa;
3. a equipa da plataforma não a tiver escondido aqui.

O site mostra só o nome comercial (ou o nome), o logótipo e a cidade.

## Números da página inicial

A página inicial mostra as escolas activas e os alunos com matrícula activa, contados no
SIGA. São totais: nenhum dado de pessoas sai do sistema.

## Se o SIGA não responder

Cada parte cai no texto fixo do site (perguntas, números) ou desaparece (escolas, artigos).
O formulário de contacto abre o programa de e-mail com a mensagem pronta para o suporte.

## Base de dados

Tabelas só do servidor, criadas por `supabase/migrations/20261007100000_web_site_content.sql`:
`web_blog_posts`, `web_faqs`, `web_contact_messages`, `web_school_showcase`. Rotas: públicas
em `/api/saas/public/{site,blog,contact}` e do ADMIN em `/api/saas/site/{posts,faqs,messages,showcase}`.
