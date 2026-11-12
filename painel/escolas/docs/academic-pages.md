# Páginas académicas e apresentação dos cursos

Referências consultadas em 21/10/2026: [cursos](https://unasp.br/cursos/),
[Engenharia de Computação](https://unasp.br/cursos/sao-paulo/graduacao/engenharia-de-computacao/),
[bolsas](https://unasp.br/bolsas/) e [biblioteca](https://unasp.br/biblioteca/).
O cliente também forneceu uma captura da página do curso como referência de composição.

Os 18 cursos passam a ter fotografia em faixa larga, título e unidade centrados,
seguida de uma faixa de dados e acções para candidatura, plano de estudos e favoritos.
O azul/roxo, fontes, marca e conteúdo ISPAB permanecem. O módulo move os nós já
publicados, conservando campos, links editados e eventos. O plano, comparação,
ficha descarregável e navegação entre secções continuam disponíveis. Sem o módulo,
permanece a composição anterior com o conteúdo e acções completos.

16 cabeçalhos de páginas internas recebem fotografias com molduras discretas;
os seis serviços recebem imagens. As 22 imagens e respectivos textos alternativos
podem ser alterados no editor existente. As novas regiões usam `data-site-scope`:
os 4601 campos do modelo `5fd4cbb7d43915bde5c6` mantêm exactamente chave, tipo,
valor e metadados. O novo modelo `b7bb3fc0893638fd4fd6` tem 4645 campos.
`readWebsiteState` aceita apenas as duas versões anteriores explicitamente
compatíveis, sem alterar os objectos armazenados, revisão ou publicação.

A navegação adicional usa títulos e destinos já publicados, incluindo prefixos
da escola e recursos externos. É horizontal no telemóvel e acompanha o cabeçalho.
O movimento respeita as preferências existentes e não há animações permanentes.
O módulo é opcional, não inicia em portais e limpa nós, eventos e observadores.

A página inicial, selecção de portal, autenticação, APIs, pagamentos e base de
dados não mudam. Não são importados valores, vagas, classificações, docentes ou
credenciamentos do UNASP. Propinas permanecem por confirmar; os cursos de exemplo
mantêm a identificação demonstrativa. A fotografia de cada curso usa o campo
existente e os dados continuam a respeitar a publicação da escola.

Validação: compatibilidade exacta de todos os campos anteriores, testes do
website e do ciclo de montagem/desmontagem, controlos do plano e favoritos,
revisão visual em Chromium e larguras 320/390/768/1440 px. Ensaios locais e
prévia estática não representam autenticação ou cobranças reais em produção.
