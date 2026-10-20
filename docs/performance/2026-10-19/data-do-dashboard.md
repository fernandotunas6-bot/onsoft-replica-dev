# Desempenho — data e saudação do dashboard

A rota `/` actualizava `now` a cada segundo, voltando a desenhar o portal inteiro.
O único uso visível desse valor é a data completa e a saudação: não há minutos nem
segundos apresentados. Um ensaio na rota real, com o portal substituído apenas por
um contador de commits, confirmou 60 novos desenhos em 60 segundos sem mudança
visível. O mesmo ensaio confirmou pré-carga de gráficos administrativos também nos
portais de aluno, professor e encarregado, que não os usam.

O relógio passou a agendar a próxima hora local, suspendendo o timer quando o
documento está escondido e actualizando imediatamente ao voltar. Usa a mesma hora
local e a mesma formatação de antes. A mudança de data à meia-noite e as saudações
ao meio-dia e às 19h continuam automáticas; o primeiro HTML conserva `now: null`.
O relógio e a pré-carga administrativa só se ligam quando o portal é administrativo.
Os componentes lazy continuam a carregar normalmente no portal que os usa.

Não se alteraram marcação, classes, dimensões, funcionalidades, consultas,
subscrições de dados, permissões ou a actualização manual existente.

## Ensaios

- `tests/ui/dashboard-date-work.test.tsx`: rota real com fronteiras de rede e
  portais simulados; compara commits, papéis e mudanças de data/saudação.
- `tests/ui/dashboard-date-clock.test.ts`: alinhamento à hora seguinte,
  suspensão/retoma, documento inicialmente escondido, desmontagem e servidor.
- Os testes existentes da rota, portais, domínio dashboard e orçamento do primeiro
  desenho verificam os consumidores e o carregamento inicial.

Estes ensaios contam trabalho agendado e renders; não são medições de INP/LCP de
campo nem uma validação autenticada em produção.

Resultado dirigido: 58 testes aprovados em onze ficheiros. O mesmo minuto sem
mudança visível passou de 60 para 0 commits adicionais do portal. A pré-carga
administrativa deixou de ser chamada para os três papéis que não a usam. Lint
dos quatro ficheiros de código/teste sem achados.
