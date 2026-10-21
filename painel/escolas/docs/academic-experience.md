# Experiência académica: refinamento inspirado no UNASP

Referências públicas consultadas em 21/10/2026:

- [Início](https://unasp.br/) e [catálogo de cursos](https://unasp.br/cursos/):
  navegação por interesses, descoberta de cursos e orientação de ingresso.
- [Engenharia de Computação](https://unasp.br/cursos/sao-paulo/graduacao/engenharia-de-computacao/):
  resumo de formação, navegação entre secções, plano e campos de interesse.
- [Agendar visita](https://unasp.br/fale-conosco-atendimento/visite-o-unasp/agendar/):
  organização e ajuda nos campos. Não foi criado um agendamento ou enviado um formulário externo.
- O cliente também pediu a adaptação do tratamento tipográfico e da textura do
  logótipo. `ispab-wordmark.png` é a imagem ISPAB gerada para esta proposta, com
  letras robustas e linhas sobrepostas; não é o ficheiro de marca do UNASP.

## O que muda

Mantêm-se as fotografias, a sua composição, fontes, azul/roxo, rodapé escuro,
endereços e funções anteriores. As 66 páginas e os 4579 campos do manifesto
mantêm-se compatíveis: nenhum campo editorial foi renumerado ou removido.

1. A pesquisa inicial sugere até cinco cursos do catálogo actualmente disponível,
   respeita a formação seleccionada e aceita setas, Enter e Escape. O formulário
   de pesquisa completo continua a funcionar quando nenhuma sugestão é escolhida.
   Os nomes publicados são tratados como texto, e as ligações respeitam o caminho da escola.
2. O plano de cada curso permite filtrar, expandir e recolher os temas existentes.
   Limpar a pesquisa repõe os estados de abertura anteriores. A navegação entre
   secções usa um observador partilhado e indica um único destino actual.
3. A candidatura demonstrativa acrescenta telefone de exemplo e formação actual,
   ambos opcionais. A validação telefónica é de Angola. Rascunhos e registos antigos
   continuam válidos; novos valores aparecem na revisão e no resumo descarregável.
   A taxa de 24 000 Kz e o consentimento existente mantêm-se.
4. Há ajuda nos erros e contadores nos campos existentes com limite de texto.
   Durante a inicialização, os formulários locais não fazem uma submissão nativa
   que colocaria os dados no URL. O envio demonstrativo continua apenas local.
5. As entradas de secções/cartões, menus e conteúdos expansíveis ganham movimento
   discreto. O conteúdo fica legível sem animação. Preferências do sistema/site,
   foco por teclado, separador em segundo plano e desmontagem são respeitados.
6. A marca ISPAB usa a imagem gerada como máscara, em azul/roxo no cabeçalho e clara
   no rodapé. O texto editável e acessível permanece no documento. A marca anterior
   fica disponível se a imagem falhar. Um logótipo carregado pela escola tem prioridade,
   e outras escolas não recebem a marca ISPAB.

Os controlos adicionais são elementos da interface. Os conteúdos institucionais
continuam no editor existente; não foram importados programas, contactos, valores,
credenciamentos, nomes de docentes ou regras académicas do UNASP.

## Limites e validação

Os novos módulos são carregados por necessidade após a inicialização da navegação,
sem dependências novas. A candidatura oficial continua a encaminhar para a campanha
SIGA já ligada. Não há alteração de autenticação, pagamentos, notificações, esquema
de dados ou registos de produção. Express continua dependente da integração verificável
do prestador; não foi criada uma cobrança ou confirmação fictícia.

Testes dirigidos cobrem pesquisa/teclado/isolamento do caminho, texto seguro,
filtro e abertura do plano, telefone opcional, feedback, preferências e desmontagem
das animações, navegação durante carregamento, marca e prioridade do logótipo escolar.

Chromium local, com fontes reais: oito páginas em 360/390/768/1440 px, sem overflow.
Verificados rascunho novo e antigo, telefone inválido, revisão e resumo, taxa preservada,
movimento reduzido e conteúdo/navegação disponíveis se o módulo de animação falhar.
Não representa ensaio em dispositivos físicos ou execução de login/pagamento reais.
