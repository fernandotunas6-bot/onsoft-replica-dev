# Cache de recursos públicos — 20/10/2026

Foi retomado o rascunho existente de `public/_headers` e a guarda já acrescentada
ao orçamento do primeiro desenho. A guarda falhava porque `vite.config.ts` ainda
não definia `routeRules` para os recursos sem hash.

A política ficou centralizada em `nitro.routeRules`: vídeo de acesso, fontes,
ícones e marcas podem ser reutilizados durante sete dias, com
`stale-while-revalidate=2592000`. Os nomes não são imutáveis: uma substituição pode
ser detectada por revalidação. O vídeo, as fontes e as imagens não foram alterados.

O ficheiro `public/_headers` conserva a indicação da origem da política, em vez de
repetir regras: o preset Cloudflare do Nitro acrescenta os cabeçalhos gerados ao
conteúdo existente. Ter as mesmas regras nos dois sítios duplicaria os cabeçalhos.
Foi confirmada essa implementação no Nitro instalado (`writeCFHeaders`).

O adaptador Lovable encaminha as opções Nitro em execução, mas o seu tipo público
expõe apenas parte delas. As regras são validadas por `satisfies NitroConfig` e
depois espalhadas na configuração do adaptador: sem `any`, casts ou supressão de
erros de tipos. A configuração foi também verificada isoladamente pelo TypeScript.

Não há regra nova para HTML, APIs, dados escolares, sessão, service workers,
manifesto ou `browser-check.js`. A política aplica-se aos quatro caminhos públicos
definidos no rascunho/teste, sem cache global da raiz. O primeiro carregamento
mantém os mesmos ficheiros; a melhoria prevista é a reutilização em visitas
seguintes, sem atribuir uma percentagem de redução de latência.

Referências: [headers dos assets Cloudflare](https://developers.cloudflare.com/workers/static-assets/headers/)
e [routeRules do Nitro](https://nitro.build/config#routerules). A Cloudflare aplica
`_headers` aos assets; respostas do Worker exigem a configuração correspondente no
servidor, motivo para conservar também a política nas regras Nitro.

Sem deploy, SQL ou alterações à interface. A presença da política no build não é
uma certificação dos cabeçalhos publicados em produção.

## Resultado local

- 59 testes aprovados em onze ficheiros, incluindo o dashboard e a guarda de cache.
- Verificação global de tipos, lint dirigido, formatação e validação da skill aprovados.
- Build de produção no preset `cloudflare-module` aprovado.
- `_headers` gerado: as quatro políticas aparecem uma vez cada. A regra existente
  de `/assets/*`, com hash nos nomes e cache imutável, mantém-se independente.
- Sete caminhos de controlo ficaram fora de qualquer regra de cache gerada:
  `/`, `/alunos`, `/api/auth/session`, `/sw.js`, `/firebase-messaging-sw.js`,
  `/browser-check.js` e `/manifest.webmanifest`.

Evidência do artefacto: [cache-publica-build.json](cache-publica-build.json).
