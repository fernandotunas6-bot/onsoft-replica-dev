# Navegação durante a sincronização

21 de Outubro de 2026. O menu existente inicializa antes dos pedidos de configuração, conteúdos e blog. O desenho e os percursos mantêm-se.

## Falha e correcção

O `app.js` aguardava a sincronização antes de ligar os eventos do menu. Num ensaio Chromium com cada pedido retido separadamente, o botão móvel não abria o menu em nenhum dos três casos. Depois de libertar o pedido, o botão funcionava.

A inicialização existente foi antecipada, sem duplicar eventos. Os links escolares também são preparados antes do primeiro pedido e novamente após aplicar conteúdos. Reutiliza-se um único observador para links inseridos mais tarde. A navegação não abandona o caminho da escola enquanto o blog carrega.

| Pedido retido | Antes: menu responde | Depois: menu responde |
| --- | --- | --- |
| Configuração | Não | Sim |
| Conteúdos | Não | Sim |
| Blog | Não | Sim |

## Verificação

- Ensaios locais nas duas fontes: painel escolar e prévia Sites. Escape fecha o menu, devolve o foco e restaura o estado inacessível dos links recolhidos. O menu continua a funcionar após terminar a sincronização.
- Página inicial em 390×844, 844×390 e 1440×900 px: capturas antes/depois idênticas, mesmas posições/dimensões dos quatro menus e sem transbordamento horizontal. Movimento reduzido activo e fontes remotas bloqueadas de forma igual nos dois ensaios.
- Regressão no carregamento real do módulo em `tests/school-website/navigation-startup.test.ts`: configuração/conteúdos e blog pendentes, links no caminho da escola, nova aplicação de links após conteúdos e alternância para desktop.
- 97 testes do módulo, sete testes do cliente, build estático e verificações das 66 páginas/4 484 ligações aprovados localmente.

Os pedidos retidos são sintéticos. O ensaio não mede INP/LCP de produção nem valida sessões académicas reais. A publicação no domínio escolar continua a depender das credenciais Cloudflare; a prévia Sites tem publicação independente.
