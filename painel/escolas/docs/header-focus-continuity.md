# Continuidade do teclado no cabeçalho

Foram reproduzidas quatro perdas de foco em Chromium: fechar a pesquisa aberta
por Ctrl+K a partir de um submenu em mobile/desktop e passar de mobile a desktop
com foco no botão do menu ou numa ligação do submenu. Nos quatro casos, o foco
acabava no body.

O retorno escolhe agora um destino visível segundo o estado actual da página:
o botão móvel quando o menu está fechado, o título do submenu quando a secção
foi recolhida, ou a marca quando o botão móvel deixou de aparecer no desktop.
Uma origem ainda visível mantém-se. Se tiver sido removida, a pesquisa ou outro
controlo do cabeçalho oferece um destino. O foco é reposto sem deslocar a página.

A mudança de largura trata apenas o foco que estava no cabeçalho. Não interrompe
a escrita na pesquisa aberta nem desloca o foco de campos ou ligações do conteúdo.
O destino da pesquisa é resolvido ao fechar, incluindo quando a largura mudou
enquanto o diálogo estava aberto. Menus fecham e o fundo volta a estar disponível.

A composição, logótipo, cores, CSS, imagens e dimensões não mudam. Não há novos
controlos, atalhos, dependências ou campos. O manifesto completo mantém a versão
`96cb157ddf38b2059299` e os 4653 registos idênticos. Não há alterações em APIs,
portais, autenticação, candidaturas ou pagamentos.

Validação: 176 testes do website, sete testes do cliente, typecheck e checks das
66 páginas/4515 ligações e calendário. Chromium em 320/390/768/1440 px, também
com desktop de 500 px de altura; home e curso, pesquisa/escape, Tab, mudanças de
largura com/sem diálogo, foco no conteúdo, ausência de saltos de scroll, overflow
ou erros de JavaScript. Verificação sintética local; sem leitores de ecrã,
dispositivos físicos ou contas institucionais.
