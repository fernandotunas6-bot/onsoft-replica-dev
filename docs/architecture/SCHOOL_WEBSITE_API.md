# Website escolar e API do SIGA

## Âmbito

Entrega do website ISPAB em `painel/escolas`, preservando o visual aprovado. Uma implantação de website por cliente pode consumir o backend SIGA partilhado; não é uma nova instalação de SIGA nem uma base de dados por escola. A identificação de operações privadas continua no SIGA, com as guardas existentes. Não há migração de base nem deploy neste PR.

## Contrato HTTP v1

`/api/public/school-website/{campaignSlug}`. O identificador é o `enrollment_forms.slug` público real, não o nome curto do cliente ou um `school_id` enviado pelo browser.

GET devolve `{apiVersion:1,school:{name,phone,email},campaign:{slug,title,subtitle,description,isOpen:true},programs:[{id,name}]}`. Contactos seguem o filtro de integrações que já existe no SIGA. Não expõe IDs de escola/tenant, payloads, utilizadores, notas ou dados de candidaturas.

POST aceita os campos de `submitPublicEnrollmentInputSchema`: `person`, responsáveis opcionais e `desiredProgramId` UUID opcional. O servidor fixa o slug da URL, recusa IDs de escola/tenant, valida o curso contra a campanha e chama `submitPublicEnrollment`, que revalida curso activo/escola, estado do tenant e limite de candidaturas. O número oficial vem dessa função. Não há geração de recibo fictício ou escrita directa em tabelas pelo website.

A rota também limita 10 envios por hora/IP com o `clientIpFromRequest` e o limitador partilhado; sem IP ou limitador disponível falha fechada. Não depende apenas do contexto IP da função RPC. Corpo limitado a 16 KiB; JSON obrigatório; erros sem detalhes internos; `Cache-Control:no-store`; CORS por origem exacta; nenhum cookie ou Authorization público. Respostas: 201 submissão, 400 corpo/âmbito, 403 origem, 413 tamanho, 415 formato, 422 validação/curso, 429 limite, 503 campanha/submissão indisponível.

## Origens e escolas

No servidor, adicionar à configuração de runtime (não ao browser):

```json
{"campanha-ispab-real":["https://website-oficial.example"],"outra-campanha":["https://outra-escola.example"]}
```

Variável: `SIGA_SCHOOL_WEBSITE_ORIGINS`. HTTPS, origens completas sem path; HTTP só localhost/127.0.0.1 para ensaio. Não usar wildcard, origem de outro cliente ou prefix matching. O próprio origin da API funciona. GET sem Origin permite leitura pública servidor-servidor; POST exige Origin permitido. CORS não substitui autorização e não transforma a candidatura pública numa operação privada.

## Activação pendente

O URL publicado do SIGA e o slug da campanha do ISPAB não foram fornecidos. Não foi verificada uma escola/campanha real nem feita escrita em produção. O SDK do website está preparado, mas os formulários visíveis continuam em demonstração. O mapeamento de dados reais e a troca da linguagem de consentimento/confirmação devem ocorrer conjuntamente na activação, evitando submissões reais a partir de um formulário identificado como simulação.

Antes da activação, verificar em staging: origem permitida/rejeitada; campanha aberta/fechada; escola suspensa; curso de outra escola; validação; consumo do rate-limit no contexto da rota; submissão explícita e processo real; indisponibilidade e resposta ambígua sem duplicação; acesso privado pelo portal existente. Não migrar candidaturas locais de demonstração para produção.

## Rollback

Retirar a origem da allowlist e desactivar o consumo no website. O visual e a versão demonstrativa continuam disponíveis. A raiz do SIGA, os outros painéis, auth e a campanha existente não são substituídos; não há migração a reverter.
