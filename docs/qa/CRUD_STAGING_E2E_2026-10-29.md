# SIGA Plus — execução E2E de duas escolas em staging

**Data:** 29/10/2026 · **Âmbito:** matrículas, Pessoas e isolamento multi-escola, começando por smoke **somente leitura**.

## Situação verificada

- A PR #378 foi fundida na `main` em 29/10/2026; o deploy de produção na Cloudflare e a auditoria pública pós-deploy concluíram com sucesso no GitHub Actions.
- Esse resultado **não prova** a autorização e o isolamento entre duas escolas em sessão autenticada. O ensaio E2E existente em `tests/e2e/crud-tenant-readonly.spec.ts` continua sem uma execução confirmada com credenciais de staging.
- A execução usa um projecto Supabase **independente de produção** e duas escolas com pessoas e contas **fictícias**. Não reutilizar chaves, bases, credenciais nem sessões de produção.

## Como preparar o ambiente `staging` do GitHub

Criar em **Settings → Environments → staging** as seguintes configurações, com valores correspondentes exclusivamente ao projecto de staging.

| Tipo | Nome | Utilização |
| --- | --- | --- |
| Variável | `STAGING_SUPABASE_URL` | URL pública exacta `https://<staging-ref>.supabase.co` |
| Variável | `SIGA_CRUD_E2E_TENANT_A_MARKER` | Nome fictício único pesquisável na Escola A |
| Variável | `SIGA_CRUD_E2E_TENANT_B_MARKER` | Nome fictício único pesquisável na Escola B |
| Segredo | `STAGING_SUPABASE_PUBLISHABLE_KEY` | Chave publicável de staging |
| Segredo | `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Chave administrativa **apenas de staging** |
| Segredo | `SIGA_CRUD_E2E_TENANT_A_STATE_B64` | Conteúdo base64 do `storageState` da Escola A |
| Segredo | `SIGA_CRUD_E2E_TENANT_B_STATE_B64` | Conteúdo base64 do `storageState` da Escola B |

Os ficheiros `storageState` devem ter sido criados com Playwright em contas distintas do staging, com vínculo activo às respectivas escolas. Codificar o JSON com `base64` antes de guardar como segredo; **não incluir o conteúdo ou os tokens em comentários, logs, mensagens ou commits**. Recomenda-se exigir aprovação de um responsável no ambiente `staging`.

## Como lançar o ensaio

Em **GitHub → Actions → CRUD Premium — E2E de staging (somente leitura) → Run workflow**, selecionar a branch desejada, preencher `staging_project_ref` com a referência exacta do projecto de staging e `confirmation` com `STAGING`.

A execução confirma que a URL Supabase corresponde à referência declarada, recusa a referência conhecida de produção e exige os segredos/nomes fictícios. Depois instala as dependências, descodifica os dois estados de sessão em ficheiros temporários com permissões restritas, verifica o contrato de segurança, levanta uma aplicação local ligada ao staging, instala o navegador e executa os dois contextos Playwright. Por fim remove os ficheiros de sessão.

**Não executar quando o staging ainda não estiver provisionado.** A ausência de um valor faz o workflow falhar explicitamente; nunca substituí-lo por dados de produção.

## Critérios de aceitação

- Cada escola encontra o próprio marcador e não encontra o marcador da outra.
- Não há erro de rede, de autenticação nem de carregamento confundido com lista vazia.
- Um pedido do browser a outro projecto Supabase é abortado e provoca falha do ensaio.
- Os relatórios nunca incluem `storageState`, tokens ou informações pessoais.
- A suite é somente leitura e não cria alunos, cobra propinas, lança notas ou modifica dados.

## O que ainda não cobre

Este workflow prova o isolamento autenticado **de leitura no módulo Pessoas**. Não substitui os testes de escrita concorrente no PostgreSQL, autorizações por cargo e disciplina, matrícula, notas homologadas, reembolsos, anexos e regressão visual mobile. Esses cenários exigem suites separadas com dados fictícios e rollback próprio. O sucesso do deploy de produção não dispensa esses gates.

**Estado:** workflow preparado e sujeito a CI; execução E2E real depende do ambiente `staging` e de sessões privadas configuradas pelo responsável.
