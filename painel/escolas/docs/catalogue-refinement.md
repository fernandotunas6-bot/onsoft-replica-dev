# Catálogo — filtros e continuidade de navegação

20 de Outubro de 2026. Mesmas páginas, estilos, fotografias e catálogo demonstrativo do ISPAB.

## Correcções verificadas

- Retirar uma etiqueta de filtro deixava o foco no body. Agora passa para a etiqueta seguinte/anterior ou para a pesquisa quando não restam etiquetas.
- Limpar uma pesquisa sem resultados escondia o botão que tinha foco. Agora mostra todos os cursos e coloca o foco na pesquisa.
- O painel de filtros acompanha o breakpoint móvel, com estado inerte quando recolhido, aria-expanded actualizado e regresso ao botão de filtros quando necessário ao mudar de ecrã.
- A actualização diferida da pesquisa mantém o foco no curso/controlo correspondente, no curso seguinte ou na pesquisa se não houver resultados.
- Pesquisar, alterar filtros, limpar ou retirar etiquetas cancela a actualização diferida pendente, evitando uma segunda reconstrução desnecessária dos resultados.

As selecções, modalidades e ordenação mantêm o funcionamento existente no URL. Não há alterações ao conteúdo dos cursos, preços, requisitos ou integração com o SIGA.

## Verificação local

Chromium: remoção de etiquetas e foco; estado sem resultados e limpeza; abertura/fecho dos filtros móveis; mudança desktop/móvel com foco no painel e preservação da área; pesquisa, modalidade, ordenação, URL e recarregamento; pesquisa diferida com foco dentro dos resultados. As 65 páginas foram verificadas em 320, 768, 1024 e 1440 px, sem erros de JavaScript ou transbordamento horizontal.

Build e verificação de páginas, recursos e calendário nos dois projectos; saída estática equivalente; sete testes do cliente da API aprovados. Não foram criadas dependências ou novas chamadas a serviços externos.
