# Conforto mobile e cabeçalhos — 9 de Outubro de 2026

## Problema e comportamento

A raiz reduzida do SIGA fazia `2.75rem` medir 33 pixels CSS no telemóvel, apesar de o token de toque prometer 44 px. No tablet, `MobileHeader` permanecia visível até 1023 px e o cabeçalho de computador aparecia a partir de 768 px, duplicando pesquisa, conta e notificações.

Os tokens de controlo e de toque passam a usar pixels CSS. Os botões partilhados têm altura mínima de 44 px abaixo de 1024 px; os de ícone também têm largura mínima de 44 px. Campos, select e textarea usam texto de 16 px nesse intervalo, e campos/select têm altura mínima de 44 px. A partir de 1024 px conservam a densidade desktop.

O cabeçalho mobile aparece apenas abaixo de 768 px, com altura mínima de 56 px. Entre 768 e 1023 px fica o cabeçalho tablet existente, com hambúrguer e navegação inferior. A partir de 1024 px continua a composição desktop.

Os destinos da navegação inferior também passam a ter altura mínima de 44 px. O espaço reservado no conteúdo soma esse mínimo, o padding da barra e a área segura. A altura do token de cabeçalho passa a corresponder aos 56 px reais.

44 px é o objectivo de conforto do SIGA e a referência do critério WCAG 2.5.5 AAA; não é o mínimo do critério 2.5.8 AA, que usa 24 px com excepções.

## Validação

- Build de produção: aprovado.
- Testes de `tests/ui` e catálogo de navegação: 16 ficheiros, 79 testes aprovados.
- ESLint dos componentes alterados: zero erros; um aviso já existente sobre exportação de constantes em `button.tsx`.
- Checklist de estilo: aprovado, 857 ficheiros, 47/47 rotas elegíveis.
- Verificação estática de acessibilidade: aprovada, 863 ficheiros.
- `git diff --check`: aprovado.

## Limites de aprovação

Os testes acima não medem o layout num navegador. A pré-visualização local arrancou, mas o navegador de revisão não conseguiu alcançá-la. Não há captura nova nem aprovação visual autenticada. A revisão de Android/iPhone, tablet 768–1023 px, Windows/WebView2 e macOS/WebKit continua necessária.

A fonte global reduzida, os filtros/SaveBar ainda sem consumidores e a harmonização visual do desktop ficam fora desta correcção. A alteração da raiz deve ser comparada com tabelas e modais reais antes de integração. Estes mínimos não cobrem todos os botões HTML escritos directamente nos módulos nem consumidores que substituam explicitamente as classes de dimensão.

Verificar antes do merge: último item de listas acessível acima da barra inferior, formulário com teclado virtual, cabeçalho único a 767/768/1023/1024 px, labels longas e zoom. Esta alteração não é uma certificação de acessibilidade integral.
