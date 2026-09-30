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
| Voltar (reter) | E-mails de fim do período experimental e de registo por concluir | Faixa com o gradiente da marca (os e-mails não animam). |

## Regras

- Decorativo: `aria-hidden`, sem eventos; o conteúdo continua legível sem ele.
- `prefers-reduced-motion`: tudo parado. Ecrãs tácteis: sem paralaxe, desfoque mais leve.
- Sem estado React na paralaxe (variáveis CSS num `requestAnimationFrame`).
- No telemóvel, as peças de vidro do topo não aparecem por cima do título.
- Não usar em ecrãs de trabalho diário (notas, caixa, pautas): lá o foco é a tarefa.

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
