# Mobile V4 — ligação de sessão/API, 10/10/2026

Branch `feat/siga-plus-mobile-v4-isolated`, PR #116. Base deste ciclo: `b44e961bd0be14a6d22ab5f030cae02cb4965708`; ambos os workflows da base foram confirmados como aprovados.

## Implementação

- Conector `supabaseSessionTransport`: reutiliza o cliente Supabase existente, obtém o token actual via SDK em cada pedido, reporta falhas de sessão e termina apenas a sessão local. Não cria cliente, armazenamento de tokens ou MFA próprios.
- `createSigaMobileV4Gateway`, no backend/frontend principal, liga o cliente browser SIGA existente ao gateway Mobile. É uma fábrica opt-in: não muda rotas, login ou portal principal.
- Entrada `mountInstitutionalMobile(container, existingSupabaseClient)` e comando `build:institutional`: compila módulo ES autónomo e CSS para um documento isolado no mesmo host da API. Não copia o Worker/manifesto públicos nem regista service worker no host.
- Auth: mudança de conta, saída, alteração do utilizador e confirmação MFA limpam sessão, escola, catálogo e projectos; renovação normal da mesma conta preserva a escolha de escola. A subscrição é removida ao desmontar. O callback não chama o SDK de forma assíncrona.
- Transporte recusa respostas anteriores à mudança de sessão, incluindo quando a mudança ocorre durante a obtenção de token ou leitura do JSON. A interface mantém o fornecedor inicial para detectar um novo login depois de uma sessão terminar.
- Workflow Mobile compila ambos os formatos e publica o módulo institucional como artefacto separado. Não publica/activa a API em produção.

Instruções: [SESSION_API_CONNECTION.md](./SESSION_API_CONNECTION.md). A API permanece na mesma origem; não foi introduzido proxy para produção nem partilha de tokens entre domínios.

## Verificação

| Verificação                     | Resultado                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Mobile                          | 98 testes aprovados, em 7 ficheiros; 7 testes novos de SDK/transporte/interface                                         |
| Backend Mobile/RLS seleccionado | 67 testes aprovados, em 5 ficheiros                                                                                     |
| TypeScript                      | Mobile e raiz aprovados; verifica a compatibilidade com o cliente Supabase realmente instalado                          |
| Lint/formatação                 | Mobile aprovado; ESLint e Prettier do conector raiz e workflow aprovados                                                |
| Builds                          | Aplicação Mobile/PWA, módulo institucional e servidor raiz aprovados                                                    |
| PWA                             | Cache exclui API, POST e outras origens                                                                                 |
| Chromium local                  | Módulo ES compilado montou o DOM, usou SDK injectado para Bearer e API de sessão na mesma origem, e desmontou sem erros |

Os testes SDK/HTTP e o ensaio Chromium usam respostas controladas locais. Não validam Auth remoto, renovação real de um refresh token, MFA de uma conta real ou percurso académico completo. O servidor continua a verificar identidade e permissões; o token obtido por getSession não serve como decisão de autorização no browser.

## Publicação e pendências

O preview público anterior permanece em https://f72a4477.siga-plus-mobile-v4.pages.dev (`3962cee8`), com API 503. Não houve nova publicação, activação institucional, migração ou escrita na base Sga de produção neste ciclo. O módulo compilado está preparado para um host isolado; a fábrica não é invocada automaticamente no portal.

Ainda falta disponibilizar/configurar o backend de testes e o documento de montagem na mesma origem, com sessões de professor/aluno autorizadas, para verificar chamadas reais e MFA antes de activar o modo institucional. Workspace completo, notas/presenças, comandos transaccionais, chat, notificações, documentos e ficheiros continuam pendentes. Não se anuncia o aplicativo como integralmente funcional.

O CI do novo commit será executado após publicar a branch; os resultados locais acima não são apresentados como resultado desse CI.
