# Website escolar: três trabalhos em paralelo, e como se juntam

Levantamento feito a 21/10/2026 sobre `origin/main` em `12b98882`, a pedido de
não haver trabalho paralelo neste objectivo. Cobre o que está na `main`, as duas
PRs abertas e o ramo local sem PR.

## 1. O que existe

Já na `main` (Codex, 19–20/10):

- `a9cd5a61` (#196) — website ISPAB demonstrativo e API pública de candidaturas.
- `7cc34b15` (#197) — publicação do website por Direct Upload no Cloudflare.

Três trabalhos abertos sobre o mesmo objectivo:

| | Onde | O quê | Estado |
| --- | --- | --- | --- |
| **A** | PR #201 `feat/ispab-catalogue-navigation` | Editor do website dentro do SIGA, API pública de conteúdos, sobreposição em runtime, catálogo ligado a `programs`, candidaturas no formulário oficial | Aberto, rascunho. 1836+/26− em 30 ficheiros. Últimos commits hoje, 04:51 |
| **B** | PR #200 `feat/school-sites-multitenant-20261020` | Website institucional de **uma página** servido pela própria app SIGA em `/site`, resolvido por hostname, com RLS, flag de activação e paridade visual | Aberto, rascunho. 3351+/1− em 36 ficheiros. Últimos commits hoje, 04:55 |
| **C** | Ramo local `worktree-escolas-multiescola-testes` | Conteúdo do site em `content/*.json` (1338 campos em 48 ficheiros), identidade e paleta por escola, modo de demonstração desligável, envio real da candidatura | 25 commits, **sem PR e por publicar** |

A autoria separa-se pelo rodapé: os commits de A assinam `Codex
<codex@openai.com>`; B e C assinam como o utilizador.

## 2. Onde se cruzam de facto

### Ficheiros

- **C ∩ A** — 8 ficheiros em `painel/escolas`: `scripts/build.mjs`,
  `scripts/check.mjs`, `src/app.js`, `src/data.mjs`, `src/search.mjs`,
  `src/polish.css`, `school.config.json`, `README.md`.
- **C ∩ B** — nenhum. B não toca em `painel/escolas`.
- **A ∩ B** — 2 ficheiros, ambos de registo de rotas: `src/lib/public-paths.ts`
  e `src/routeTree.gen.ts`.

As alterações de A nesses 8 ficheiros são **pequenas e aditivas**: no
`build.mjs` são um import, dois ajustes de página e três ganchos no fim (copiar
`site-content.mjs`, escrever `school-runtime.json`, chamar
`writeContentManifest`). Em `app.js` são melhorias de foco e de menus em ecrãs
baixos, mais o arranque de `connectSchoolWebsite` — zonas que C não tocou.

### A colisão que não se vê num diff

**A e B escrevem os dois em `school_settings` com `domain = 'school_website'`**,
com dois formatos JSON incompatíveis *e* duas convenções de linha
incompatíveis:

- **A** usa `updateSettingsDomainValue`, o helper que já existe na `main`: faz
  `UPDATE` **de uma única linha** por `(school_id, domain)` e usa `version`
  como trava optimista (`src/features/school/settings-domains.ts:484`). Lê com
  `.maybeSingle()`.
- **B** insere **uma linha nova por versão** no mesmo domínio, histórico
  append-only, e lê a de maior `version`
  (`src/features/school-site/persistence.ts:19,69`). A `UNIQUE` real é
  `(school_id, domain, version)`, por isso a base aceita.

Consequência concreta: depois de duas publicações em B, o `.maybeSingle()` de A
sobre `(school_id, domain)` recebe mais do que uma linha e falha — e o mesmo
vale para qualquer leitor do convénio actual. Não é um conflito de merge; é um
conflito em produção, que só aparece quando as duas funcionalidades existirem
ao mesmo tempo.

A política RESTRICTIVE de B sobre esse domínio
(`20261020213000_school_website_draft_read_guard.sql`) **não** parte A, porque A
lê pela chave de serviço — mas governa todo o resto e deve entrar coordenada.

### A e C resolvem o mesmo problema em camadas diferentes

| Preocupação | A (runtime) | C (build) |
| --- | --- | --- |
| Onde vive o conteúdo | `school_settings`, aplicado no browser | `content/*.json`, aplicado no build |
| Identidade do campo | sha256 **posicional** do HTML gerado | **nome estável** (`home.hero.headline`) |
| Sair da demonstração | `templateVersion` bate e há configuração; se falhar, mostra a demonstração | `demo:false` com lista de verificação que **recusa** publicar |
| Candidaturas | Reencaminha para o formulário oficial `/matricula/{slug}` | POST para a API pública de matrícula |
| Portal | Reescreve os links em runtime | `portalUrl` no build; páginas do portal fora |
| Catálogo | Cursos ligados a `programs`; inactivos saem | Guarda recusa publicar o catálogo de exemplo |

## 3. O que é mesmo paralelo

**A e C não são alternativas — são duas camadas da mesma coisa**, e só colidem
num ponto: *quem dá identidade ao campo editável*. A identidade posicional de A
é frágil por desenho, e o próprio documento de A assume-o: «um modelo
incompatível bloqueia gravações antigas… os dados anteriores devem ser
compatibilizados durante a actualização». Qualquer mexida na marcação muda os
`sha256` seguintes e invalida o que a escola já escreveu. A identidade nomeada
de C sobrevive a isso.

**B é outro produto**: uma página institucional para as 48 escolas, dentro da
app, com a infra de segurança feita. O próprio documento de B diz que
`painel/escolas` «não é um template universal já ligado à BD» e que a v1 «não
constitui ainda um CMS multi-página». O que B duplica não é o site — é o
**sítio de armazenamento e o editor**.

## 4. Proposta de união

Uma arquitectura, três donos:

1. **A superfície editável nasce no conteúdo.** `content/*.json` e as formas
   declaradas em `scripts/content.mjs` passam a ser a fonte dos campos.
   `content-manifest.mjs` deixa de raspar o HTML gerado e percorre essas chaves,
   mais as colecções de `data.mjs` — que já são nomeadas (`data.courses.3.name`)
   e ficam como estão. `templateVersion` passa a ser o hash do **conjunto de
   chaves**: só muda quando um campo nasce ou morre, não quando a marcação se
   mexe.
2. **O editor e a API ficam como estão.** `WebsiteSettingsPanel`,
   `content-model`, `content-server`, `/api/public/school-content/$code`,
   auditoria, controlo de revisão e CORS por origem exacta são trabalho bom e
   não precisam de mudar — só muda a origem dos `fields`.
3. **O runtime continua a aplicar.** `site-content.mjs` mantém o mecanismo de
   marcadores; os marcadores passam a trazer a chave nomeada.
4. **O build continua a decidir o que o site é.** Identidade, paleta,
   `demo:false` e a lista de verificação. As camadas compõem-se: o build diz o
   que o site *é*, o runtime diz se o conteúdo publicado *chegou*.
5. **Candidaturas por uma só via:** a de A, o formulário oficial, porque
   reutiliza a validação, os limites e o processo reais. O cliente de POST de C
   fica documentado como alternativa desligada por omissão.
6. **Uma convenção de linha em `school_settings`** — decisão 1, abaixo.

## 5. Ordem de execução

1. Decidir a convenção de linha (decisão 1).
2. **Publicar o ramo C e abrir PR.** Hoje são 25 commits que mais ninguém vê;
   é a principal fonte de paralelismo.
3. Fundir em `painel/escolas`. Os 8 ficheiros partilhados são tratáveis: as
   alterações de A são aditivas. O trabalho real são duas coisas — reescrever
   `content-manifest.mjs` sobre as chaves nomeadas e repor os dois ajustes de A
   nas páginas que C reescreveu (`data-siga-login` e `data-siga-status` na
   página de entrada).
4. Juntar `school.config.json`: C traz `demo`, `api`, `palette` e
   `currencyName`; A traz `contentUrl`.
5. B: aplicar a migração RLS (serve os dois) e fixar o âmbito (decisão 2).

## 6. Decisões que não são técnicas

1. **Convenção de linha no domínio `school_website`** — respondida abaixo, na
   secção 7.
2. **Âmbito de B.** A página única para as 48 escolas é um produto que o site
   de ISPAB não cobre, e o contrário também é verdade. Mantê-los é legítimo —
   mas então são dois produtos com **um** contrato de conteúdo, não dois
   editores. A alternativa é B ficar com a infra (RLS, flag, hostname, paridade
   visual) e o conteúdo vir do modelo de A+C.
3. **Quem escreve a seguir.** Se o GPT continuar na #201 enquanto outro agente
   mexe nos mesmos 8 ficheiros, o paralelismo volta no dia seguinte. A divisão
   natural: o lado `painel/escolas` (manifesto nomeado e fusão) de um lado; o
   lado SIGA (editor, API, testes) do outro, sobre o manifesto novo.


## 7. Resposta à decisão 1: uma linha com trava optimista

Recomendação: **uma linha por `(school_id, domain)` com trava optimista**, como
todo o resto do SIGA. A #200 deixa de inserir uma linha por versão e passa a
usar o `updateSettingsDomainValue`; o JSON que já desenhou fica intacto.

### Porquê

**A restrição que está no repositório proíbe o append-only.** A única DDL desta
tabela, em `supabase/migrations/20260908120000_school_settings_versioned.sql`,
declara:

```sql
UNIQUE (school_id, domain)
```

A #200 assume o contrário («a restrição real é `UNIQUE(school_id, domain,
version)`»). Se a restrição em produção for a do repositório, a **segunda**
publicação de uma escola rebenta com violação de unicidade. O retrato de
produção de 12/10 confirma as colunas (`id, school_id, domain, version, value,
changed_by, created_at`) mas não regista restrições, por isso isto tem de ser
confirmado na base antes de qualquer decisão de implementação:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.school_settings'::regclass and contype = 'u';
```

**O convénio actual não é desta funcionalidade: é da tabela.** Estão em uso pelo
menos dez domínios (`academic`, `agt`, `billing`, `branding`, `higher_ed`,
`institution`, `pedagogy`, `print_templates`, `spotlight`,
`teacher_contact_visibility`) e doze chamadas ao helper partilhado. Mudar a
convenção num domínio só significa passar a ter duas na mesma tabela, e a
partir daí cada leitor tem de saber qual é qual. É o tipo de divergência que
não dá erro — dá dados errados.

**A #200 não precisa do histórico para ter o que quer.** O JSON que ela própria
desenhou já separa rascunho e publicação: `{schemaVersion, draft, published,
publishedAt}`. Rascunho, publicação e detecção de edição concorrente cabem numa
linha, com `version` como trava — que é o que a #201 faz. As linhas por versão
dão «todas as publicações passadas», que nenhuma das duas funcionalidades pede
na v1.

**Se o histórico for mesmo preciso**, o sítio é o `audit_logs` — que a #201 já
escreve antes de gravar — ou uma tabela própria. Não a chave de uma tabela de
estado partilhada por dez funcionalidades.

### O que fica de pé da #200

A migração RLS `20261020213000_school_website_draft_read_guard.sql` continua
necessária e serve as duas: hoje qualquer membro da escola — incluindo alunos e
encarregados — pode ler o domínio pela API. A flag `SCHOOL_SITES_ENABLED`, a
resolução por hostname e a paridade visual também não dependem da convenção de
linha.

### O que isto ainda não resolve

A convenção de linha é necessária, não suficiente: com as duas a escrever uma
linha só, continuam a escrever **formatos diferentes** na mesma chave. É a
decisão 2 — um contrato de conteúdo, dois produtos.
