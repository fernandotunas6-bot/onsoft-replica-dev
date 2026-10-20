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
| `page-heads.json` | O cabeçalho de cada página, pela rota: olho, título e descrição. |
| `simple-pages.json` | As cinco páginas de serviço (secretaria, apoio, carreiras, investigação, bolsas). |

A identidade da escola — nome, país, idioma, moeda — **não** está aqui: está
em `../school.config.json`, porque é configuração do cliente e não texto
editorial.

## As quatro regras

**Uma chave em falta é um erro.** O build pára e diz o caminho exacto no JSON
(`navigation.menus[2].links[1].label`). Nunca publica uma página com um texto
vazio no lugar.

**O conteúdo é texto, não marcação.** Tudo passa por `esc()` no gerador: um
`<b>` escrito aqui aparece no site como `<b>`, não como negrito.

**A ênfase escreve-se `*assim*`.** Nos títulos, `*três palavras*` ficam
destacadas na cor da escola. Abre e fecha sempre; o build recusa um asterisco
sozinho. Um título que seja uma lista de linhas (`"title": ["...", "..."]`)
quebra a linha entre cada uma.

**As ligações são caminhos internos.** Começam por `/` e terminam no site:
`internalUrl()` recusa `https://…`, `//…` e `javascript:…`. Uma ligação para
fora não se disfarça de página interna. `"external": true` acrescenta a seta
de saída ao rótulo.

A única saída do site é o bloco `resources` de uma página, onde `externalUrl()`
aceita `https://` sem credenciais — a agência de bolsas do país é conteúdo da
escola, não uma excepção escrita no gerador.

## O nome da escola dentro do texto

Os marcadores `{{SCHOOL}}`, `{{SCHOOL_UPPER}}`, `{{COUNTRY}}`,
`{{COUNTRY_UPPER}}`, `{{CURRENCY}}`, `{{CURRENCY_NAME}}` e `{{LANG}}` são substituídos pelos
valores de `school.config.json`. Escrever `Viva o {{SCHOOL}}` serve qualquer
escola; escrever o nome à mão serve uma só. Um marcador que não exista —
`{{SCHOL}}` — falha na suite de testes, não em produção.

## Antes de publicar

```sh
npm test    # valida estes ficheiros
npm run build
npm run check
```
