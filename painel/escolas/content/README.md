# Conteúdo do site

Os ficheiros desta pasta são o que o site **diz**. O gerador
(`scripts/build.mjs`) decide a estrutura das páginas; o conteúdo decide os
textos, os rótulos e as ligações. Editar aqui não exige tocar em código.

| Ficheiro | O que controla |
| --- | --- |
| `navigation.json` | Os menus do cabeçalho: título, destaque e ligações de cada menu. |
| `header.json` | Barra superior, ligação para a página da instituição, pesquisa e botão do portal. |
| `footer.json` | Assinatura, colunas de ligações, aviso de versão demonstrativa e barra legal. |
| `site.json` | Blocos repetidos em todas as páginas: metadados, aviso padrão e chamada final. |
| `home.json` | A página de entrada inteira: herói, atalhos, as quatro secções e a faixa azul. |
| `components.json` | Os cartões repetidos: curso, artigo, evento, e a caixa de pesquisa. |
| `page-heads.json` | O cabeçalho de cada página, pela rota: olho, título e descrição. |
| `notices.json` | Os avisos de versão demonstrativa, por chave — o que reescrever na activação de uma escola real. |
| `simple-pages.json` | As cinco páginas de serviço (secretaria, apoio, carreiras, investigação, bolsas). |
| `pages/*.json` | Uma página por ficheiro (`sobre`, `privacidade`, `ajuda`, `agenda`…). As formas estão declaradas em `scripts/content.mjs`. |

A identidade da escola — nome, país, idioma, moeda — **não** está aqui: está
em `../school.config.json`, porque é configuração do cliente e não texto
editorial.

## As quatro regras

**Uma chave em falta é um erro.** O build pára e diz o caminho exacto no JSON
(`navigation.menus[2].links[1].label`). Nunca publica uma página com um texto
vazio no lugar.

**O conteúdo é texto, não marcação.** Tudo passa por `esc()` no gerador: um
`<b>` escrito aqui aparece no site como `<b>`, não como negrito.

**A ênfase escreve-se `*assim*` e `**assim**`.** Nos títulos, `*três palavras*`
ficam destacadas na cor da escola e `**três palavras**` ficam a negrito. Abre e
fecha sempre; o build recusa um asterisco sozinho. Um título que seja uma lista
de linhas (`"title": ["...", "..."]`) quebra a linha entre cada uma. Onde o
destaque aparece com outra etiqueta — a faixa azul da entrada usa `<span>` —
quem decide é o gerador: o conteúdo diz apenas que há ênfase.

**As ligações são caminhos internos.** Começam por `/` e terminam no site:
`internalUrl()` recusa `https://…`, `//…` e `javascript:…`. Uma ligação para
fora não se disfarça de página interna. `"external": true` acrescenta a seta
de saída ao rótulo.

Dentro de uma frase, uma ligação escreve-se `[o meu perfil](/portal/perfil/)`.
O destino é validado como caminho interno, como qualquer outra ligação.

A única saída do site é o bloco `resources` de uma página, onde `externalUrl()`
aceita `https://` sem credenciais — a agência de bolsas do país é conteúdo da
escola, não uma excepção escrita no gerador.

## O nome da escola dentro do texto

Os marcadores `{{SCHOOL}}`, `{{SCHOOL_UPPER}}`, `{{COUNTRY}}`,
`{{COUNTRY_UPPER}}`, `{{CURRENCY}}`, `{{CURRENCY_NAME}}` e `{{LANG}}` são substituídos pelos
valores de `school.config.json`. Escrever `Viva o {{SCHOOL}}` serve qualquer
escola; escrever o nome à mão serve uma só. Um marcador que não exista —
`{{SCHOL}}` — falha na suite de testes, não em produção.

## O que fica no gerador

Três coisas, de propósito:

- **os dados** — cursos, áreas, artigos, eventos, serviços e perguntas
  frequentes vivem em `src/data.mjs`, e as disciplinas de exemplo do portal em
  `scripts/build.mjs`;
- **os valores dos filtros** (`Licenciatura`, `Presencial`, `Diurno`…) — são
  comparados com os campos dos cursos pelo código do site; mudá-los aqui
  partiria a filtragem;
- **a estrutura** — o HTML, os ícones decorativos e as setas.

Um teste (`não sobra texto visível no gerador`) varre os módulos do gerador à
procura de frases: se alguém voltar a escrever texto no HTML, a suite falha.

## Modo de demonstração

Enquanto `school.config.json` tiver `"demo": true` (o estado por omissão), o
site avisa em cada página que é uma prévia. Duas convenções decidem o que muda
quando sai desse modo:

- **`"demo": { ... }`** dentro de um bloco substitui as chaves do bloco na
  demonstração. O texto real fica na chave normal — `"copyright": "{{SCHOOL}}"`
  — e o da prévia em `demo` — `"copyright": "{{SCHOOL}} · Prévia de website"`.
  Uma chave que só exista em `demo` (como o aviso do rodapé) desaparece.
- **`"demo": true`** num item de lista publica-o só na demonstração. É assim que
  a ligação «Sobre o projecto» sai do rodapé.

Num ficheiro inteiro, `"demo": true` no topo significa outra coisa: que aquele
texto é da demonstração e **tem de ser reescrito** antes de publicar a sério. O
build recusa-se a sair do modo de demonstração enquanto `privacidade`,
`acessibilidade` e `candidatura` tiverem essa marca.

## Antes de publicar

```sh
npm test    # valida estes ficheiros
npm run build
npm run check
```
