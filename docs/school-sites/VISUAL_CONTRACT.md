# Contrato visual inalterável — Website Escolar ISPAB → SIGA School Sites

**Decisão funcional (2026-10-20):** conservar o estilo, visual, navegação, animações, tipografia, hierarquia e composição do site escolar de referência, **sem alterar, simplificar, redesenhar ou substituir o original**.

## 1. Fonte de verdade (somente leitura)

A implementação visual aprovada está em `painel/escolas/`:

- `src/style.css`: geometria, tipografia, breakpoints, hero, menus, secções, cartões, portal e rodapé.
- `src/polish.css` e `src/refinements.css`: refinamentos cromáticos, fotografia, transições e microinteracções.
- `scripts/build.mjs`: semântica, ordem e estrutura visual das páginas, incluindo barra superior, cabeçalho, menus, hero e rodapé.
- `docs/visual-spec.md`: normas visuais, 60 rotas e larguras testadas.
- `school.config.json`: configuração da prévia escolar de origem (não transportar dados fictícios).
- `public/assets/`: imagens e SVG demonstrativos do ISPAB. NÃO usar nas outras escolas como se fossem reais.

**Não alterar estes ficheiros neste trabalho.** Toda a adaptação deverá residir num pacote/componente/CSS **separado** e ser validada contra o layout de referência. Não importar globalmente o CSS do website ISPAB no portal SIGA.

## 2. Fidelidade visual exigida

| Elemento do ISPAB | Contrato |
| --- | --- |
| Identidade | Manter hierarquia, dimensões, posição da marca e tratamento profissional do cabeçalho; só nome/logótipo da própria escola são variáveis |
| Topline | Barra institucional discreta acima do cabeçalho |
| Navegação | Mesma geometria, linguagem visual, comportamento mobile e foco acessível; não acrescentar páginas falsas |
| Cor | Base #1558ee, títulos #11223e / refinados #142c4d, texto #2b405c, fundo #f6f8fd, linhas #e0e7f1; a escola pode personalizar cor de destaque através de token controlado |
| Tipografia | Manrope (títulos) e DM Sans (corpo); as fontes específicas necessitam da mesma licença/activos antes de declarar fidelidade exacta, sem copiar ficheiros de fontes proibidos |
| Hero | Composição 1.05fr/1fr, título dominante, descrição curta, CTA e figura com forma assimétrica, grelha discreta, elementos flutuantes só quando tiverem semântica aprovada |
| Layout | Largura até 1240px, 1320px em grandes ecrãs; breakpoints 760/1000/1500px |
| Cartões e rodapé | Manter raio, tipografia, densidade, linhas finas, composição e hierarquia existentes |
| Movimento | Respeitar `prefers-reduced-motion` e tempos/ritmo discretos; não adicionar animações novas ao modelo |
| Portal escolar | A imagem pública não muda o design interno, auth, notas ou permissões do SIGA |

As cores são referências extraídas do código original. **O CSS isolado da primeira versão é aproximação técnica, não uma certificação de pixel-perfect.** O modelo completo exige ensaios visuais da mesma composição e todas as páginas aplicáveis.

## 3. Dados reais e funcionamento multi-tenant

A **única** personalização por escola deve ser um conjunto autorizado de dados: nome, logótipo licenciado/armazenado, foto institucional, texto, tema de cor, cursos reais publicados, contactos consentidos, menus e secções habilitados no SIGA. Não alterar a estrutura visual por padrão, não criar elementos apenas para preencher lacunas. Se não houver conteúdo, utilizar o estado visual vazio discreto previsto, sem imagens ou informações da escola de referência.

A navegação `/site` é temporária, para não substituir o portal `/` legado. O caminho final só muda com migração segura de callbacks, links e autenticação.

## 4. Validação obrigatória antes de aprovação

- Diff da PR em `painel/escolas/**` deve ser **vazio**.
- Testes visuais lado a lado da página de referência e do novo motor a 320, 390, 768, 1024, 1440 e 1920 px.
- Validar cabeçalho/topline, hero, rodapé, espaçamentos, menus abertos, cores, fontes, imagens, zoom, foco, motion reduced.
- Conferir que conteúdo da escola A não surge na escola B (inclusive cache e MediaFrame).
- Conferir que `/site` não altera globalmente o CSS do SIGA.
- Não declarar "site idêntico" até existir teste visual com captura lado a lado aprovado.
- **Não tocar em `painel/escolas`, nos seus caminhos, dados, assets, scripts, fontes e CSS durante a implementação SIGA; toda evolução tem de ser independente.**

## 5. Critério de mudança futura

Qualquer alteração ao site original requer trabalho e revisão **separados**, solicitados expressamente. A evolução da plataforma deve procurar **reutilizar o desenho original**, não modificá-lo por conveniência técnica. O original permanece referência independente e intacta.
