# Visual «Aurora» — onde usar para atrair e reter

Fundo azul → violeta em movimento lento, grelha que se desvanece no canto, peças de vidro 3D a
flutuar com paralaxe pelo ponteiro, e uma mascote (pasta de pautas com olhos que piscam e seguem
o cursor). Só CSS e SVG de ícones: sem vídeo nem imagens, não pesa no carregamento.

- WEB: `painel/web/src/components/brand/aurora.tsx`, `siga-phone-demo.tsx`; estilos em
  `painel/web/src/index.css` («Aurora»).
- SIGA: `src/components/brand/aurora.tsx`; estilos no fim de `src/styles.css`.

## Onde está e porquê

| Momento do cliente | Onde | O que faz |
| --- | --- | --- |
| Descobrir (atrair) | WEB → topo da página inicial | Fundo Aurora, peças de vidro e **telemóvel com o SIGA a arrumar uma escola** (os passos do arranque vão ficando feitos). Mostra o produto em vez de o descrever. |
| Decidir | WEB → chamada final («Ponha a sua escola a trabalhar») | Mesmo fundo e mascote: fecha a página com a mesma identidade do topo. |
| Registar (converter) | WEB → `/start` | Aurora suave por trás do formulário: a pessoa sente que continua no mesmo sítio, sem distrair do formulário. |
| Primeira vitória | WEB → «… está criada» | A mascote recebe a escola nova — o momento de celebração antes de entrar no painel. |
| Primeiro uso (activar) | SIGA → «Arranque da escola» | O guia usa o mesmo fundo: a escola reconhece o sítio de onde veio e o guia destaca-se do resto do painel. Pronto → peça de vidro com visto. |
| Primeiro uso (activar) | SIGA → assistente «Configurar a escola» (`/configuracoes/inicio`) | O progresso usa o mesmo fundo do cartão «Arranque»; sai quando a escola fica pronta. |
| Voltar (reter) | E-mails de fim do período experimental e de registo por concluir | Faixa com o gradiente da marca (os e-mails não animam). |

## Tons por área

Um tom por área, escolhido pelo caminho da página (`src/lib/area-tone.ts`) e aplicado uma vez
em `<html data-tone>` (`__root.tsx`). As cores vêm só de `[data-tone=…]` em `styles.css`: mesma
luminosidade e saturação para todos, muda só a tonalidade.

| Tom | Áreas | Cor |
| --- | --- | --- |
| `marca` | Painel, site, registo | azul → violeta |
| `pedagogica` | Pedagógica, professores, planos de aula, calendário, relatórios académicos | violeta → magenta |
| `financeiro` | Financeiro, faturas, tesouraria, relatórios financeiros; página de preços do site | verde → turquesa |
| `secretaria` | Alunos, pessoas, matrículas, documentos, acessos, importação | azul-céu |
| `rh` | RH e folha salarial, presença dos professores | âmbar |
| `comunicacao` | Comunicações, arquivos, alumni | rosa → fúcsia |
| `sistema` | Configurações, perfil, assinatura | índigo acinzentado |

Onde o tom aparece:

- **Cabeçalho de todas as páginas do SIGA** (`PageHeader`): brilho suave por trás do título.
- **Texto em gradiente** (`.text-aurora`): no máximo uma palavra ou expressão por título
  principal — «completa», «a trabalhar», «trabalhar todos os dias», «da sua escola», «sua escola»,
  o nome na saudação do painel e «Arranque». Nunca em títulos de páginas de trabalho.

Outros usos, cada um num só componente:

- **Estados vazios** (`EmptyState`): nos grandes, o ícone é uma peça de vidro na cor da área.
  Com `firstUse` («Ainda não há comunicados / planos de aula / contas / membros») aparece a
  mascote — nunca em «nenhum resultado neste filtro».
- **Plano recomendado** (preços do site): contorno em gradiente animado, só nesse cartão.
- **E-mail do código do registo**: texto próprio («Confirme o seu e-mail…») e aviso claro a quem
  não pediu.

## Regras

- Decorativo: `aria-hidden`, sem eventos; o conteúdo continua legível sem ele.
- `prefers-reduced-motion`: tudo parado. Ecrãs tácteis: sem paralaxe, desfoque mais leve.
- Sem estado React na paralaxe (variáveis CSS num `requestAnimationFrame`).
- No telemóvel, as peças de vidro do topo não aparecem por cima do título.
- Não usar o fundo Aurora em ecrãs de trabalho diário (notas, caixa, pautas): lá o foco é a
  tarefa. Nesses ecrãs só existe o brilho do cabeçalho.
- Nada de novos tons por página: uma área nova entra em `area-tone.ts` com um dos sete tons.
- O texto em gradiente anima em 9 s e o brilho em 16 s: movimento que se nota, não que chama.

## Como medir

O funil do registo já é guardado (`saas_signup_leads`, ADMIN → «Registos de escolas»):

1. Taxa de conclusão (escolas criadas ÷ registos iniciados) nas duas semanas antes e depois da
   publicação.
2. Onde se desiste (passo com maior queda) — se não mudar, o visual não é o problema.
3. Activação: escolas com o «Arranque da escola» concluído em 7 dias (`getSchoolSetupGuide`).

## Próximos sítios possíveis

- Página de preços (WEB) — plano recomendado com peça de vidro.
- Ecrã de login do SIGA (hoje com vídeo) — trocar por Aurora reduz o peso da página.
- Estados vazios do SIGA (sem turmas, sem alunos) — mascote a apontar para a acção.
