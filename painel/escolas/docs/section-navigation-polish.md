# Indicação da secção em leitura

Nos cursos e páginas institucionais, o observador anterior considerava uma faixa
larga da janela. Depois de seleccionar Competências, uma parte de Apresentação
continuava nessa faixa e recuperava o marcador. O mesmo foi reproduzido na segunda
secção de Ingresso, em Chromium local a 390 e 1440 px.

A navegação partilha agora uma faixa estreita na posição de leitura já definida
pelas margens dos destinos e pelo scroll-padding do documento. Recalcula-a ao
redimensionar, sem alterar CSS, âncoras ou o deslocamento nativo. O separador activo
acompanha os cliques, a leitura e as mudanças do fragmento do histórico; no
telemóvel é revelado apenas no eixo horizontal da barra existente.

A montagem é idempotente. A desmontagem desliga observadores e eventos, cancela
medições pendentes e repõe os atributos anteriores. Cliques e fragmentos continuam
a funcionar sem IntersectionObserver. Não foram acrescentadas dependências,
secções, campos, imagens ou alterações de identidade.

O manifesto foi comparado integralmente com o anterior: versão
`96cb157ddf38b2059299` e 4653 registos idênticos. Portal, autenticação, campanhas,
pagamentos, APIs e dados escolares permanecem fora desta alteração.

Validação: testes de regressão do marcador, redimensionamento, histórico sem
observador, deslocação horizontal, montagem/desmontagem; suite do website,
compilação e verificação das 66 páginas. Ensaio local Chromium com movimento
reduzido em 320/390/768/1440 px, incluindo ecrã desktop de 600 px de altura,
âncoras, Voltar/Avançar, retorno ao catálogo filtrado e ausência de overflow.
São verificações sintéticas; não representam uma auditoria de produção autenticada.
