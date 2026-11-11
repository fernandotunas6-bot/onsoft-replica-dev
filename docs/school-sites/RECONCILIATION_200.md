# PR #200 — reconciliação com o website escolar actual

Revisão e correcções de 24/10/2026, sobre `main` em
`42ad7effd475c45ebdb47a10d969e64e8aefc7c1`. A #200 permanece uma proposta antiga,
com head `98e22e230f7737dd97af6b9866ed314299eb6188`.

## Contrato que se conserva

O motor canónico é `src/features/school-website`, com editor em
`/configuracoes?painel=website`, blog e páginas servidas pelo website existente.
A publicação usa a linha de `school_settings` do domínio `school_website`,
`updateSettingsDomainValue` para concorrência e snapshots editoriais separados.
Não importar `src/features/school-site`, o schema v1 da #200, o seu editor nem
as inserções append-only para esse mesmo domínio. Os formatos são incompatíveis.

Mantém-se a política `school_web_content_server_only`, restritiva para todas as
operações de `anon`/`authenticated` nos domínios `school_website` e `school_blog.*`.
O serviço só acede aos editores depois de verificar membership, cargo e módulo;
a sonda `school_web_storage_ready()` continua obrigatória. A migração antiga
`20261020213000_school_website_draft_read_guard.sql` não faz parte desta correcção.

Não tomar a antiga discussão sobre unicidade por prova da base actual: houve uma
correcção posterior indicando `(school_id, domain, version)` na produção. O risco
confirmado de integração é o contrato dos consumidores actuais, que esperam uma
linha e usam `.maybeSingle()`, e não uma alegada falha inevitável da segunda escrita.
Qualquer conversão de dados deve primeiro levantar o catálogo e as linhas reais.

## Correcções sobre o motor actual

- Website e blog exigem cargo exacto `Administrador` da membership validada,
  mesmo se um grant extraordinário de Gestão tiver permitido passar pelo guarda
  de módulo. Leituras continuam sujeitas ao módulo e à sonda da base.
- Todas as alterações editoriais exigem `aal2` nas claims validadas pelo middleware,
  incluindo guardar, publicar, retirar, repor, arquivar e restaurar. AAL1 ou claims
  sem AAL2 são recusadas antes de carregar o cliente privilegiado.
- As APIs públicas de conteúdo e blog exigem escola `active`, como o resolvedor
  das páginas já exigia. Escola inactiva, suspensa, arquivada ou de estado
  desconhecido não pode continuar a fornecer publicações através dessas APIs.
- Páginas, links administrativos e origens públicas só admitem os tipos
  `siga_subdomain` ou `custom_domain` verificado. Tipo desconhecido não é aceite
  pelo facto de ter `verified_at` preenchido. Continua a ser exigido estado activo.
- A validação editorial recusa IPs literais, nomes de rede local, credenciais na URL,
  formatos conhecidos de assinaturas/tokens temporários e objectos Supabase
  `sign`/`authenticated`. Mantém imagens locais e URLs HTTPS públicas estáveis.
  A projecção pública volta a validar o conteúdo; registos inválidos falham fechados.

Estas regras de URL são sintácticas: não fazem DNS, não seguem redireccionamentos,
não verificam MIME, propriedade nem consentimento. Não tornam um ficheiro privado
público. O administrador deve escolher um recurso público autorizado e estável.
Contactos administrativos não são adicionados à resposta pública por esta correcção.

O visual, os ficheiros originais de `painel/escolas`, as rotas do portal, o modelo
editorial, o histórico existente e os lockfiles não são alterados.

## Matriz de aceitação

| Critério | Evidência disponível | Decisão / próximo passo |
| --- | --- | --- |
| Um único motor e contrato | Alterações feitas sobre `school-website`; nenhuma importação do motor antigo | Preservar na integração; não fundir a #200 integralmente |
| Cargo e AAL2 | Testes de handlers com grants extraordinários, cargos recusados e AAL1/claims ausentes | Código coberto; ensaiar sessão real Admin+AAL2 antes de rollout |
| Escola activa e origens | Testes das duas rotas HTTP com duas escolas, estado inválido, origem de B em A e domínio não verificado/desconhecido | Cobertura local; falta encaminhamento real |
| Rascunho/publicação/concorrência | Suite existente de estados, editor, DTO e controlo de revisão | Repetir ciclo completo em staging com duas sessões |
| RLS | Ensaio local da migração actual, duas aplicações, policy permissiva paralela, anon/authenticated e serviço | Comprova política local; não comprova catálogo instalado nem JWT real |
| Imagens/URLs/HTML | Novos casos adversariais; testes existentes de escape e renderização | Falta consentimento, MIME, redireccionamentos e origens reais dos recursos |
| Contactos públicos | Motor actual não lê contactos administrativos para os injectar nas páginas | Validar o conteúdo editorial autorizado da escola canário |
| Fidelidade visual | Nenhum ficheiro visual ou template alterado neste incremento | Não herdar certificação pixel-perfect dos testes antigos da #200 |
| CI actual | Checks locais registados abaixo; CI remoto associado ao commit da PR correctiva | Só considerar integração após CI obrigatório verde |
| Dependências desktop | `npm audit --prefix desktop --audit-level=high --json`: 4 pacotes high, 3 moderate, 0 critical na base actual | Bloqueio ainda aberto: Zod e Undici; não herdar o antigo parecer de Vite 8.3.3 como auditoria actual completa |
| Domínio canário e rollback | Procedimento abaixo, ainda não executado | Manter rollout pendente |

## Ensaio real antes do rollout

Usar staging independente, duas escolas de ensaio A/B e contas autorizadas, sem
copiar dados pessoais de alunos. Não reactivar escolas arquivadas para fabricar
um canário. Registar SHA, ambiente, hora local, perfis e respostas sem tokens.

1. Confirmar o catálogo efectivo: política restritiva actual, RLS forçada, acesso
   exclusivo do serviço à sonda e confirmação positiva da prontidão do armazenamento.
2. Admin A com AAL1 não grava. Com AAL2 guarda o rascunho; visitante não o recebe.
   Publica; visitante recebe apenas o snapshot. Nova edição não altera o público.
3. Admin B, aluno, encarregado, professor e secretaria não lêem nem alteram os
   rascunhos de A por server functions ou API directa Supabase. Repetir A contra B.
   Verificar também um utilizador de outro cargo com grant Total em Gestão.
4. Duas sessões de A editam a mesma revisão: a segunda não sobrepõe a primeira.
   Retirar publicação conserva o rascunho e não volta a servir publicação antiga.
   Distinguir retirada de conteúdo da API da disponibilidade da identidade pública
   e das páginas do template, conforme `SCHOOL_WEBSITE_CONTENT.md`.
5. Confirmar hostname exacto, origem cruzada, domínio próprio não verificado,
   hostname inexistente e tenant suspenso. `X-Forwarded-Host` ou IDs enviados
   pelo cliente não podem trocar a escola autorizada.
6. No domínio canário, validar TLS, página inicial, `/site/`, APIs de conteúdo/blog,
   `/portal?escola=...`, login/MFA e links. Confirmar `no-store` e ausência de
   conteúdo de A nas respostas de B, inclusive após navegação repetida.
7. Rever imagens, contactos e consentimentos; executar verificação visual nos
   seis tamanhos e dispositivos previstos. Só então decidir promoção.

Rollback: interromper a promoção e restaurar o deployment anterior. Preservar
linhas editoriais e a política server-only; nunca abrir SELECT directo para
recuperar o editor. Se o código candidato estiver operacional, retirar a publicação
pela interface autorizada. Revalidar o portal e as APIs existentes. Não executar
SQL destrutivo nem aplicar a migração da #200 como rollback.

## Validação local deste incremento

Resultados: **292 testes em 35 ficheiros aprovados**, incluindo 18 casos novos
sobre as duas rotas HTTP e os cenários de cargo/AAL2/recursos; TypeScript sem erros;
lint com 0 erros e 47 avisos existentes; inventário de 18 módulos e 13 testes de
navegação aprovados; build de produção local Node aprovado. O ensaio PGlite aprovou
idempotência, recusa de acesso directo, acesso do serviço e sonda de prontidão.

A auditoria desktop efectuada neste incremento encontrou 4 pacotes high e 3 moderate
(0 critical). O relatório aponta Zod `<4.6.6`, Undici `<7.30.1` e a cadeia dos plugins
ESLint/Vitest. A sugestão automática do npm para o plugin React Compiler chega a
propor `0.0.0`, uma alteração incompatível que não é uma correcção validada. Não foi
aplicada uma actualização forçada de Zod 3 para 4 nem retirada qualquer regra de
segurança para obter CI verde. Este bloqueio de dependências exige uma correcção
compatível e os checks próprios do desktop; não é resolvido pelo build web.

Comandos:

```sh
npx vitest run tests/school-website/ tests/security/module-grant-enforcement.test.ts --fileParallelism=false
npm run typecheck
npm run lint
npm run siga:check
SIGA_NITRO_PRESET=node-server npm run build
SIGA_SQL_TEST_MODULE_PATH=/tmp/siga-website-sql/node_modules/@electric-sql/pglite/dist/index.js node tests/sql/school-website-content.mjs
```

PGlite instalado isoladamente em `/tmp`, versão 0.3.14. Os testes usam fixtures e
mocks; não executam sessão real nem publicação. O build usa o preset local Node,
não comprova execução no Worker Cloudflare. As dependências locais foram
reutilizadas da cópia de trabalho; a instalação congelada fica a cargo do CI.
Nenhuma migração, DNS, segredo ou deployment de produção é alterado por este trabalho.
