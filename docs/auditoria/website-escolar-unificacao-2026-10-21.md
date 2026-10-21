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
  (`src/features/school-site/persistence.ts:19,69`).

Consequência concreta: depois de duas publicações em B, o `.maybeSingle()` de A
sobre `(school_id, domain)` recebe mais do que uma linha e falha — e o mesmo
vale para qualquer leitor do convénio actual. Não é um conflito de merge; é um
conflito em produção, que só aparece quando as duas funcionalidades existirem
ao mesmo tempo.

> **Correcção, 21/10 (ver secção 11).** A primeira versão deste documento dizia
> que a restrição da produção era `UNIQUE (school_id, domain)` e que a base
> recusaria a segunda publicação. É falso: lida da produção, a restrição é
> `UNIQUE (school_id, domain, version)`. A base **aceita** o modelo de B. O
> conflito mantém-se — e é pior assim, porque nada falha a escrever.

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
2. **Âmbito de B** — respondida na secção 8.
3. **Quem escreve a seguir** — respondida na secção 9.


## 7. Resposta à decisão 1: uma linha com trava optimista

Recomendação: **uma linha por `(school_id, domain)` com trava optimista**, como
todo o resto do SIGA. A #200 deixa de inserir uma linha por versão e passa a
usar o `updateSettingsDomainValue`; o JSON que já desenhou fica intacto.

### Porquê

**A restrição não decide isto** — ver a secção 11. A base aceita várias linhas
por domínio; o que não as aceita é o código que as lê.

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


## 8. Resposta à decisão 2: B fica com a infra, não com um segundo contrato

Recomendação: **um contrato de conteúdo, dois renderizadores.** B mantém a
migração RLS, a flag, a resolução por hostname e a rota pública; deixa cair o
esquema próprio e a cópia do desenho.

### Porquê

**As «48 escolas» não são uma audiência hoje.** A auditoria da própria B conta
48 tenants com **4 activos, 43 arquivados e 1 falhado**, e o retrato de
produção diz o mesmo por outras palavras: o volume é de ensaio. O argumento de
alcance que justificava um produto à parte — chegar a todas as escolas sem
deployment — aplica-se, na prática, a meia dúzia.

**O que B duplica não é o alcance, é o desenho.** São 627 linhas de
`public-style.css` a reproduzir o aspecto do site de ISPAB, mais testes de
paridade visual para detectar a deriva entre as duas cópias. Uma cópia que
precisa de um teste para não divergir é uma cópia que vai divergir.

**O que B tem de único é infra, e essa não colide com nada:** a política
RESTRICTIVE sobre o domínio (hoje qualquer membro da escola lê os rascunhos
pela API), a flag `SCHOOL_SITES_ENABLED` desligada por omissão, a resolução por
hostname sem aceitar `school_id` do browser, e o runbook.

### A forma

Um **contrato** — as chaves nomeadas do conteúdo — e dois **renderizadores**:

- o build estático de `painel/escolas`, que dá o site completo (65 páginas) e
  precisa de publicação por escola;
- a rota `/site`, que dá uma página só, sem deployment nenhum, lendo um
  **subconjunto declarado das mesmas chaves** (`home.hero.*`, `sobre.*`,
  contactos) em vez de um esquema próprio.

A escola começa na página única no dia em que é criada e passa ao site completo
quando quiser — e **o que escreveu sobrevive à mudança**, porque as chaves são
as mesmas. Com dois esquemas, essa passagem é reescrever tudo.

## 9. Resposta à decisão 3: a fronteira é o manifesto

`painel/escolas` de um lado, `src/` do outro, e o manifesto gerado é o contrato
entre os dois.

O que torna esta divisão limpa é que o editor, a API e o runtime da #201
consomem o manifesto por **forma**, não por conteúdo:
`{version, fields:[{key, group, kind, label, value, dataPath?}]}`. Mudar a
*origem* das chaves — de `sha256` posicional para o nome do campo no conteúdo —
não muda essa forma. O lado SIGA não precisa de alterar uma linha; só de
regenerar o `template.json` com o `sync-school-website-template.mjs` que já tem.

Divisão proposta:

| Lado | Quem | O quê |
| --- | --- | --- |
| `painel/escolas` | este ramo | manifesto sobre chaves nomeadas, fusão dos 8 ficheiros, build e verificação |
| `src/features/school-website` | #201 | editor, API pública, permissões, auditoria, testes |
| `src/features/school-site` | #200 | RLS, flag, hostname, `/site` sobre o mesmo contrato |

Enquanto a fronteira não estiver no sítio, qualquer um dos lados a mexer nos 8
ficheiros repõe o paralelismo no dia seguinte.


## 10. O que a execução corrigiu na própria proposta

A secção 4 propunha que o manifesto passasse a usar **as chaves nomeadas do
conteúdo** (`home.hero.headline`). Ao executar, medi primeiro se isso era
alcançável casando os campos do manifesto com os valores do conteúdo:

| | campos vindos do HTML |
| --- | ---: |
| correspondência única com uma chave de conteúdo | 2171 (52%) |
| ambíguos (o mesmo texto em várias chaves) | 855 |
| sem par (títulos compostos, contagens, imagens, URLs de dados) | 1111 |

52% não chega para servir de identidade, e emitir a chave no momento de
desenhar obrigaria a distinguir posição de texto e de atributo em cerca de 500
pontos de interpolação. A proposta estava errada no mecanismo e certa no
objectivo.

O que resolve o objectivo com uma mudança pequena é **derivar a chave do
próprio texto**: `sha256(âmbito + atributo + texto normalizado)`, com desempate
por ordem só entre repetições do mesmo texto no mesmo âmbito.

Medido acrescentando um parágrafo à página de entrada:

| | chaves | ligação intacta | trocaram de texto |
| --- | ---: | ---: | ---: |
| pela posição (#201) | 4569 → 4570 | 4423 (96%) | **146** |
| pelo texto | 4567 → 4568 | 4567 (100%) | 0 |

O número que interessa é o das trocas. As chaves não desapareciam — mudavam de
dono: o que a escola tivesse escrito para esses 146 campos seria aplicado
noutros elementos. O guarda de `templateVersion` apanhava-o, mas invalidando
tudo o que já estava escrito.

Com chaves derivadas do texto, o guarda deixa de precisar de ser uma porta
fechada: aplica-se o que ainda existe no manifesto e assinala-se
`data-siga-content="synced-older"` quando a publicação vem de um modelo
anterior.

Feito no ramo `integration/escolas-site-unificado-20261021`, com a #201
fundida: 65 páginas, 4567 campos editáveis, 117 testes.

## 11. A restrição, lida na produção — e a correcção que obriga

Consulta só-leitura ao catálogo, 21/10/2026, projecto `xodgfmxiaunpamctfeea`:

```
school_settings_school_id_domain_version_key   UNIQUE (school_id, domain, version)
school_settings_pkey                           PRIMARY KEY (id)
school_settings_version_check                  CHECK (version > 0)
```

**A #200 tinha razão e eu estava errado.** A base aceita várias versões do mesmo
domínio. A secção 7 dizia o contrário, apoiada na única DDL do repositório
(`supabase/migrations/20260908120000_school_settings_versioned.sql`), que
declara `UNIQUE (school_id, domain)`. **O ficheiro e a base divergem; a base é
que vale** — é o mesmo padrão já registado noutras auditorias.

### O que isto muda, e o que não muda

Muda o argumento: a base não impede o modelo da #200. **Não muda a
recomendação** — e, lida de perto, a produção reforça-a:

| domínio | linhas | escolas | `version` máximo |
| --- | ---: | ---: | ---: |
| academic | 47 | 47 | 5 |
| branding | 2 | 2 | 3 |
| institution | 2 | 2 | 2 |
| preferences | 2 | 2 | 5 |
| pedagogy | 1 | 1 | 5 |
| print_templates | 1 | 1 | 11 |

Nenhum domínio tem mais linhas do que escolas: **não há uma única linha de
histórico em toda a tabela**. O `version` sobe na própria linha — onze vezes no
`print_templates`. O convénio a correr é o do `updateSettingsDomainValue`:
UPDATE da linha única, `version` como trava optimista, leitura por
`readSettingsRow` com `.maybeSingle()`.

E é por isso que a restrição permissiva torna o problema **pior**, não melhor:
com `UNIQUE (school_id, domain)` a segunda publicação falhava na escrita, à
vista. Como a base aceita, nada falha a escrever — falha a **leitura seguinte**,
em todos os consumidores do domínio ao mesmo tempo, com a mensagem genérica
«Não foi possível ler as definições (school_website)».

### Recomendação, inalterada

Uma linha por `(school_id, domain)` com trava optimista. O
`{schemaVersion, draft, published, publishedAt}` da #200 cabe lá; o histórico de
publicações, se for mesmo preciso, vai para o `audit_logs` — que a #201 já
escreve — ou para uma tabela própria.

Fixado em `tests/sql/school-settings-row-convention.mjs`, que corre a tabela com
a restrição **real** da produção e mostra as duas metades: a segunda linha é
aceite, e um leitor de linha única passa a ver duas.

### Uma dívida separada

A migração do repositório declara uma restrição que a base não tem. Alinhar o
ficheiro com a base é trabalho à parte, e tem de ser feito a partir do catálogo,
não do ficheiro.
