# Website escolar: edição no SIGA e sincronização pública

O administrador da escola abre **Definições → Website escolar** (`/configuracoes?painel=website`). O editor mantém o desenho do website e permite alterar os campos das páginas públicas existentes: navegação, rodapé, textos, imagens, links, metadados, cursos, notícias, agenda, serviços e perguntas frequentes. Não permite HTML, JavaScript ou CSS arbitrários, nem altera dados privados do portal académico.

## Publicação

As alterações são guardadas no domínio `school_website` da tabela existente `school_settings`. A protecção de leitura directa é activada pela migração `20261021051004_school_website_content_server_only.sql`; não existe uma base separada nem chave adicional por escola. A escola vem sempre da membership activa validada no servidor. Leituras exigem Administrador e acesso ao módulo Gestão; alterações exigem escrita nesse módulo e o estado operacional permitido da escola. Antes de gravar, regista-se um pedido em `audit_logs`; uma falha na auditoria impede a alteração. O registo descreve um pedido, que poderá ser recusado por conflito de revisão.

O rascunho e a publicação são separados. **Guardar rascunho** não altera o site. **Publicar no site** grava o conteúdo publicado. A próxima abertura de cada página consulta a API com `cache: no-store`. **Repor publicação no rascunho** permite voltar à última publicação; **Retirar publicação da API** interrompe o fornecimento de conteúdo. Esta última operação não desliga a hospedagem: o template demonstrativo incluído no website permanece disponível.

Cada alteração usa comparação de revisão sobre o mecanismo de concorrência já existente em `updateSettingsDomainValue`. Um editor antigo recebe um erro em vez de sobrepor alterações de outro administrador. A interface deve ser recarregada após um conflito; copie as alterações locais antes de recarregar, se necessário.

## Endereços automáticos e domínio próprio

Cada escola provisionada já tem `tenant_domains` e uma relação 1:1 entre tenant e escola. A mesma implantação SIGA passa a servir o website público no início de um hostname escolar activo. O nome e o logótipo vêm da escola resolvida no servidor; não existe cópia nem instalação do SIGA por cliente.

- `https://{slug}.{PLATFORM_DOMAIN}/`: página inicial da escola.
- `/site/cursos/`, `/site/blog/` e restantes páginas públicas: caminhos próprios do website no mesmo hostname. Assim, `/calendario` continua a ser o módulo académico e `/site/calendario/` é a página pública.
- `/portal?escola={slug}`: dashboard/login existente. O parâmetro é apenas uma intenção: a conta tem de possuir uma membership activa na escola. Não altera permissões nem dá acesso à conta de outra escola.
- `{SIGA_URL}/escolas/{slug}/`: endereço alternativo na plataforma, mesmo antes de existir wildcard DNS. Todos os links do website permanecem nesse caminho.
- Um domínio próprio só apresenta a escola quando estiver em `tenant_domains`, com `status=active` e `verified_at` preenchido. Os subdomínios atribuídos pela plataforma usam o registo activo do provisionamento. Domínios desconhecidos, pendentes ou de outra escola não são herdados por aproximação.

A configuração usa `PLATFORM_DOMAIN`/`VITE_PLATFORM_DOMAIN` e os URLs do ecossistema existentes. Não há domínio de produção hardcoded nem criação de DNS por escola. O domínio próprio continua a usar **Identidade Digital**, a verificação de propriedade e as condições do plano já implementadas. DNS, encaminhamento e certificado HTTPS têm de levar o tráfego à plataforma; a aplicação não compra domínios nem emite certificados por declarar um hostname na base.

## Activação

1. Aplicar na instalação correcta a migração [20261021051004_school_website_content_server_only.sql](../../supabase/migrations/20261021051004_school_website_content_server_only.sql), também incluída em `APPLY_ENROLLMENT_AND_PREMIUM.sql`. Ela acrescenta uma política restritiva apenas para `school_website` e `school_blog.*`, sem retirar o acesso às outras definições. A função de confirmação é executável apenas pelo serviço. Sem confirmação positiva, os editores recusam leituras/gravações; o website conserva apenas o template inicial e não carrega publicações.
2. Publicar a versão SIGA pelo processo de revisão e deployment do repositório. O plugin Vite prepara automaticamente as páginas e recursos de `painel/escolas`, inclusive quando o deploy usa `npx vite build` directamente.
3. Confirmar o wildcard/encaminhamento já previsto na plataforma ou usar o endereço alternativo `/escolas/{slug}/`. Escolas existentes e futuras são resolvidas pelo mesmo código, sem passo extra no provisionamento ou publicação estática por escola.
4. No SIGA, abrir **Definições → Website escolar** para os endereços reais, conteúdos e campanhas; **Gerir domínio próprio** abre o fluxo de Identidade Digital. Não é necessário copiar JSON para o website servido na própria plataforma.

A opção **Domínio para hospedagem externa** serve para uma instalação estática adicional, como a prévia Sites. Nesse caso, **Copiar configuração** fornece `portalUrl`, `contentUrl`, `blogUrl` e uma identificação do armazenamento demonstrativo. Guardar o JSON como `school-runtime.json` na hospedagem ou configurar os URLs antes do build. O código público é `schools.public_code`; não é `school_id`, tenant ID ou slug da campanha. Não há segredos nessa configuração.

A prévia Sites continua independente da implantação SIGA: os seus dados de demonstração não são transferidos para registos oficiais. Em endereços partilhados, o armazenamento demonstrativo é separado pelo código público da escola.

## Login e candidaturas

O website não recolhe palavras-passe nem cria identidades. Os links de acesso abrem a instalação SIGA existente, que continua a gerir sessão, recuperação de conta, escola activa e MFA. A prévia estática conserva a opção de portal demonstrativo explicitamente identificada. O website servido pela plataforma apresenta o acesso real e não oferece essa demonstração como alternativa ao login. O acesso privado da hospedagem Sites é independente da conta académica.

O editor lista apenas campanhas da escola activa. Ao escolher uma campanha e publicar, a API devolve o caminho do formulário oficial `/matricula/{slug}` quando está aberto. Os botões de candidatura passam a abrir esse formulário no SIGA; o site não copia registos demonstrativos para candidaturas reais. Campanhas encerradas desactivam os botões de candidatura e não abrem o formulário local demonstrativo. A API anterior de submissão continua documentada em [SCHOOL_WEBSITE_API.md](SCHOOL_WEBSITE_API.md).

## Catálogo ligado ao sistema

No campo de nome de cada curso, o administrador pode associar um programa activo da sua escola. Depois da publicação, o nome é lido da tabela `programs` a cada consulta pública. A desactivação do programa retira-o do catálogo, das opções de candidatura e apresenta indisponibilidade na página individual. Os identificadores académicos não fazem parte da resposta pública.

Descrições, imagens, requisitos e conteúdos curriculares continuam editoriais. Não existe correspondência automática por nome, criação de páginas para novos programas ou importação de notas, propinas, alunos ou documentos privados. Novas páginas, novos registos e mudanças de estrutura exigem actualizar o template e a sua implantação; os conteúdos dos registos existentes são editáveis no painel.

## Contrato e falhas

`GET /api/public/school-content/{publicCode}` devolve exclusivamente `apiVersion`, `templateVersion`, revisão/data de publicação, valores publicados, campos de cursos indisponíveis e estado/caminho público da campanha seleccionada. Nunca devolve rascunhos, permissões, actores, IDs de escola/tenant, ligações internas dos cursos ou credenciais. O CORS compara origens exactas; não usa wildcard nem credenciais. Uma escola inexistente, arquivada, bloqueada ou sem publicação não recebe uma publicação pública. Erros de base de dados devolvem uma mensagem genérica.

O site aplica textos por `textContent` e valida URLs. O código HTML, classes, estilos e interacções continuam no template aprovado. Marcadores de comentário permitem editar o texto sem adicionar elementos ao layout. O catálogo dinâmico recebe os mesmos valores publicados. A versão do template deve coincidir: caso contrário, o site apresenta a demonstração inicial com um aviso de sincronização indisponível. Não guarda respostas antigas da API no armazenamento local. Uma sessão já aberta recebe alterações na próxima navegação/reabertura, sem polling.

## Actualizar o template

Depois de alterar o website em `painel/escolas`, executar:

```sh
node scripts/siga/sync-school-website-template.mjs
```

Versionar o `template.json` gerado juntamente com os ficheiros do website e publicar as duas partes compatíveis. Um modelo incompatível bloqueia gravações antigas para evitar aplicar campos nas posições erradas; os dados anteriores são preservados em `school_settings` e devem ser compatibilizados durante a actualização. O manifesto completo é carregado apenas pelo editor; o visitante recebe um ficheiro de ligações reduzido para os dados dinâmicos.

## Validação local

```sh
npx vitest run tests/school-website/ tests/school/settings-domains.test.ts tests/security/module-grant-enforcement.test.ts --fileParallelism=false
npm run typecheck
npm run build
npm --prefix painel/escolas run build
npm --prefix painel/escolas run check
npm --prefix painel/escolas test
```

Os testes usam dados fictícios e dependências controladas; não activam a integração nem alteram a base de produção. A activação real depende do endereço e da implantação SIGA da escola e da configuração do website.


## Blog de cada escola

**Definições → Blog da escola** permite criar artigos, editar título/resumo/texto/categoria/capa/assinatura pública, guardar rascunhos, publicar, retirar publicação, arquivar e restaurar. Os artigos não usam `web_blog_posts`: essa tabela continua a pertencer ao blog comercial do produto. Cada artigo escolar tem um domínio `school_blog.{slug}` na tabela existente de definições. A chave única `(school_id, domain)` impede endereços duplicados entre artigos da mesma escola; escolas diferentes podem usar o mesmo slug. O endereço de um artigo fica fixo após a primeira gravação, e a revisão impede sobrepor edições concorrentes.

O rascunho e a publicação são snapshots separados: editar não muda o que o público lê. Arquivar remove a publicação; restaurar conserva o rascunho sem republicar. A API filtra `school_id`, o prefixo do domínio e `value->>isPublished` antes de paginar. Devolve apenas os campos publicados; a lista não inclui o corpo. Texto é apresentado como parágrafos literais, sem HTML executável; capas exigem HTTPS.

`GET /api/public/school-blog/{publicCode}` devolve a lista paginada (`page`, 12 artigos), e `?slug={slug}` devolve um artigo publicado. Os mesmos domínios escolares activos/verificados e o domínio externo publicado controlam o CORS exacto, sem cookies. No website da plataforma, listagens e artigos são renderizados no servidor em `/site/blog/` e `/site/blog/{slug}/`; o nome, título, descrição e canonical acompanham a escola/artigo. Na instalação estática, `/blog/?artigo={slug}` apresenta o artigo consumindo a mesma API. A página inicial apresenta as três publicações mais recentes.

## Verificação da protecção de dados

A política original `settings_select_member`, confirmada em `PRODUCTION_SNAPSHOT.json`, permite a membros ler definições. Proteger só a API não protegeria rascunhos de acesso directo. A nova política é **RESTRICTIVE**, cobre SELECT/INSERT/UPDATE/DELETE dos domínios de conteúdo e mantém os outros domínios intactos. O servidor usa service role depois de validar a membership e o papel. A migração não foi aplicada à produção nesta implementação.

O ensaio `tests/sql/school-website-content.mjs` executa a migração real duas vezes em PostgreSQL local (PGlite), demonstra a recusa de leitura/gravação por anon/authenticated mesmo com uma policy permissiva paralela e verifica o acesso do serviço e a sonda de activação. Entra automaticamente no ciclo de ensaios SQL do CI. A sonda não substitui revisão das políticas se forem alteradas manualmente posteriormente.
