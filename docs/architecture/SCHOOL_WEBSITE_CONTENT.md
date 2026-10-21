# Website escolar: edição no SIGA e sincronização pública

O administrador da escola abre **Definições → Website escolar** (`/configuracoes?painel=website`). O editor mantém o desenho do website e permite alterar os campos das páginas públicas existentes: navegação, rodapé, textos, imagens, links, metadados, cursos, notícias, agenda, serviços e perguntas frequentes. Não permite HTML, JavaScript ou CSS arbitrários, nem altera dados privados do portal académico.

## Publicação

As alterações são guardadas no domínio `school_website` da tabela existente `school_settings`. Não existe migração SQL nem chave adicional de acesso. A escola vem sempre da membership activa validada no servidor. Leituras exigem Administrador e acesso ao módulo Gestão; alterações exigem escrita nesse módulo e o estado operacional permitido da escola. Antes de gravar, regista-se um pedido em `audit_logs`; uma falha na auditoria impede a alteração. O registo descreve um pedido, que poderá ser recusado por conflito de revisão.

O rascunho e a publicação são separados. **Guardar rascunho** não altera o site. **Publicar no site** grava o conteúdo publicado. A próxima abertura de cada página consulta a API com `cache: no-store`. **Repor publicação no rascunho** permite voltar à última publicação; **Retirar publicação da API** interrompe o fornecimento de conteúdo. Esta última operação não desliga a hospedagem: o template demonstrativo incluído no website permanece disponível.

Cada alteração usa comparação de revisão sobre o mecanismo de concorrência já existente em `updateSettingsDomainValue`. Um editor antigo recebe um erro em vez de sobrepor alterações de outro administrador. A interface deve ser recarregada após um conflito; copie as alterações locais antes de recarregar, se necessário.

## Activação por escola

1. Publicar esta versão do SIGA pelo processo normal de revisão e deployment do repositório.
2. No editor, indicar o domínio HTTPS da página inicial do website, sem caminhos, parâmetros ou fragmentos. Esse domínio controla o CORS da API de conteúdos.
3. Usar **Copiar configuração** e guardar o JSON em `school-runtime.json` na raiz da hospedagem do website. Em instalações compiladas, os mesmos `portalUrl` e `contentUrl` podem ser definidos em `painel/escolas/school.config.json` antes do build. A configuração contém apenas URLs públicas.
4. Guardar e publicar os conteúdos no editor. Abrir o site e verificar `data-siga-content="synced"` no elemento `html`, a navegação para o SIGA e os conteúdos publicados.

Exemplo ilustrativo — substituir os endereços pelos da instalação real:

```json
{
  "portalUrl": "https://siga.instituicao.ao/",
  "contentUrl": "https://siga.instituicao.ao/api/public/school-content/CODIGO_PUBLICO"
}
```

O código é o `schools.public_code` da escola, devolvido ao administrador pelo próprio SIGA. Não é o `school_id`, o identificador do tenant nem o slug da campanha. O endpoint de conteúdos funciona sem campanha de matrícula aberta.

## Login e candidaturas

O website não recolhe palavras-passe nem cria identidades. Os links de acesso abrem a instalação SIGA existente, que continua a gerir sessão, recuperação de conta, escola activa e MFA. A opção de portal demonstrativo permanece explicitamente identificada; visitas normais a `/portal/` são encaminhadas ao SIGA quando existe configuração. O acesso privado da hospedagem Sites é independente da conta académica.

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
