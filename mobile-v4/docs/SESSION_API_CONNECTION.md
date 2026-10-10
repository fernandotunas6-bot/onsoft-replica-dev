# Ligação do Mobile V4 à sessão e API SIGA

O conector reutiliza a instância Supabase já autenticada do SIGA. Não cria outro cliente, não copia tokens entre domínios e não implementa outro login/MFA. O servidor continua a verificar identidade, MFA, vínculo, papel e permissões por escola. `getSession` serve apenas para fornecer o Bearer do pedido.

## Host no SIGA

`src/features/mobile-v4/browser.ts` exporta `createSigaMobileV4Gateway()`, que liga o cliente browser existente (`src/integrations/supabase/client.ts`) ao transporte Mobile. A fábrica não é chamada automaticamente e nenhuma rota principal foi alterada.

Num host React isolado, fornecer esse gateway ao componente Mobile:

```tsx
const gateway = createSigaMobileV4Gateway(); // manter estável durante a montagem
<App initialGateway={gateway} />;
```

A folha de estilos Mobile tem seletores globais; usar um documento isolado, não montar por cima do portal principal. Não transferir tokens para um iframe de outra origem.

## Entrada independente para o mesmo host

Compilar com `npm run build:institutional` na pasta `mobile-v4`. Produz `dist-institutional/institutional.js` e `institutional.css`; a aplicação pública normal continua a compilar em `dist`.

No documento isolado, carregar a folha de estilos e importar a entrada. O código do host fornece a sua instância autenticada existente:

```js
import { mountInstitutionalMobile } from "./institutional.js";
const unmount = mountInstitutionalMobile(document.getElementById("root"), existingSupabaseClient);
// Ao fechar o documento/host:
// unmount();
```

O módulo React é autónomo; não usar um segundo React para renderizar esse mesmo root. O container deve pertencer exclusivamente ao Mobile. Não regista o service worker do preview num host que já tenha uma PWA.

## API exigida na mesma origem

O documento deve servir os endpoints autenticados implementados no backend SIGA:

- `GET /api/mobile-v4/session`
- `GET /api/mobile-v4/schools/:schoolId/academic?role=professor|aluno`
- `POST /api/mobile-v4/logout`

Workspace completo e comandos continuam a devolver 503 enquanto a integração está incompleta. Não activar permissões de escrita nem apresentar esses módulos como concluídos.

O transporte consulta o SDK em cada pedido; a renovação e armazenamento continuam a cargo da configuração Supabase existente. Eventos de saída, mudança de conta, alteração de utilizador e confirmação MFA invalidam os dados e obrigam a voltar a seleccionar escola. Renovação normal da mesma conta mantém a escolha. Respostas HTTP anteriores à mudança de sessão são recusadas. O callback Auth é síncrono, não faz chamadas Supabase e a subscrição é removida ao desmontar.

## Estado verificado

Testes locais usam SDK/HTTP controlados: renovação do Bearer, erros de sessão, ausência de sessão, scope local de logout, mudança de conta/MFA, rejeição de resposta tardia e limpeza da interface. Não são testes com contas reais nem prova de publicação de backend.

O Pages público continua a responder `503 INSTITUTIONAL_API_DISABLED`. Ainda é necessário disponibilizar um backend de testes isolado com configuração validada e ensaiar professor/aluno com contas autorizadas antes de activar a ligação. Não apontar o preview público automaticamente ao portal de produção.

## Preview ligado ao Sga

`npm run build:connected` compila a entrada isolada de testes e o Worker autenticado em `dist-connected`. Requer instalar primeiro as dependências bloqueadas da raiz e depois as de `mobile-v4`. O build usa o cliente Supabase real do portal; não inclui credenciais de servidor no navegador. Entrada por e-mail/senha e confirmação do TOTP existente; chaves WebAuthn ligadas ao domínio original não funcionam no domínio Pages.

O Worker expõe apenas `/api/mobile-v4/*`, com a validação de sessão/MFA/escola existente. O adaptador de cookies usa AsyncLocalStorage para preservar contexto por pedido. Outras rotas `/api/*` devolvem 404. A configuração Supabase é fornecida por bindings de preview, incluindo a chave de servidor como secret_text. Não regista service worker nem guarda respostas académicas em cache.

A publicação manual deve usar a branch de ambiente `staging-mobile-v4-pr116`, que difere da production_branch do projecto Pages. Não executar scripts de deploy do portal, alterar a configuração de produção ou aplicar SQL. Workspace completo, comandos e outros módulos não implementados permanecem indisponíveis; só o catálogo académico anuncia leitura autorizada.
