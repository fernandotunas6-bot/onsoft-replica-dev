# Refinamento visual Flutter

Design system único em `lib/design/` (substitui o anterior `lib/design_system.dart`):

- `tokens.dart`: superfície branca, preto suave nos títulos, cinzento no texto
  secundário, azul institucional configurável (Aparência → Cor principal),
  espaçamento de 8, cantos 12/16/24, painéis inferiores com escurecimento
  discreto e sem desfoque; o gradiente pertence só à identidade (o «S» e a
  marca). Claro e escuro.
- `widgets.dart`: cartões com borda fina, mosaicos de serviço em grelha de três
  (duas em ecrãs estreitos), ícones monocromáticos, etiquetas de estado, estados
  vazios/erro e avatar por iniciais.
- `floating_nav.dart`: barra inferior flutuante com indicador que desliza.

Serviços no início por perfil e com rotas reais: avisos para todos; propinas,
notas e documentos só para o aluno. Integrações que ainda não existem (WhatsApp
da turma, aulas online, presenças/notas da turma, GPS do transporte) aparecem
como «Por activar» ou «Simulação», com a explicação, sem botões fictícios.

Avisos, propinas, notas e documentos em cartões com o estado em português
(«Pronto a levantar», «Pago em parte»…), a mesma validação de antes. Chat em
balões (os meus à direita, na cor principal) com hora de Luanda, resposta
citada e anexo identificado; as páginas antigas aparecem acima das recentes.
Apresentação de três páginas uma só vez, depois da abertura do S, com
«Saltar»; não espera pela sessão.

Revisto em Chromium a 390×844, claro e escuro, com uma pré-visualização local
de dados fictícios. Inter empacotada e o vector original do S (ou Rive)
permanecem pendentes; validação em Android/iOS físicos também.
