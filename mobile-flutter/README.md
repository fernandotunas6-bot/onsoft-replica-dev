# SIGA Plus Flutter 2026

Base incremental para substituir o cliente Mobile V4 em m.portal-siga.com.
**Ainda não substitui a aplicação publicada.** Esta branch parte de
0249dab7, preserva o backend Mobile V4 e não executa migrações.

## Implementado

Flutter Material 3, GoRouter com separadores preservados, selector de vínculos
activos/perfil aluno ou professor; e-mail/senha e desafio TOTP do Supabase SGA;
consulta HTTP de sessão, disciplinas/turmas, horários, tarefas, notas
publicadas, avisos paginados e lista de conversas. Mudança de escola/conta invalida respostas pendentes. A API existente
continua a decidir autorização e MFA; o cliente não consulta tabelas académicas.
Notas apenas no perfil aluno, por trimestre e na escala comunicada pela escola
(nenhuma média é calculada no dispositivo); avisos por audiência da escola, com
fixados primeiro e «Ver avisos anteriores» por cursor opaco.
Estados de erro/carregamento/vazio, pesquisa, refresh e aparência claro/escuro.
Introdução 3,2 s ou 650 ms após a primeira abertura, com salto, indicador de
passos, apresentação inicial, movimento reduzido e restauração de sessão em
paralelo. As preferências de abertura, tema, plano
de fundo, cor principal, movimento e estilo de ícones ficam no dispositivo; o
SDK gere a sua própria sessão.

## Desenho

Sistema visual medido a partir dos ecrãs aprovados em `lib/design.dart`
(espaçamento, raios, tipografia, paleta clara/escura e componentes partilhados),
documentado em [docs/DESIGN.md](docs/DESIGN.md), que também lista o que foi
mantido fiel e o que foi dito por palavras em vez de simulado com dados.
Ecrãs: abertura em três tempos, apresentação, login, escolha de escola,
início, disciplinas, calendário (agenda e horários), mensagens, grelha de
serviços escolares, espaço da turma, notas, avisos, conta, aparência,
transporte (conceito) e páginas de preparação por serviço.

## Identidade: limite explícito

O painter é uma proposta tipográfica com expansão, recorte e dissolução.
**Não é o morph vectorial exacto pedido pelo utilizador.** A referência raster
não fornece o vector original; não foi criado nem inventado um ficheiro Rive.
Antes da aprovação visual, obter o SVG original do S, construir um artboard
Rive e validar a transformação contínua S → Seja bem-vindo → S.
O wordmark provisório também não substitui a arte final fornecida.

## Executar

Flutter 3.35.7 / Dart 3.9.2 (validado nesta versão: `pub get`, `dart format`,
`analyze` sem avisos, `test` com 29 testes e `build web --release`):

```
flutter pub get
flutter analyze
flutter test
flutter run -d chrome --dart-define=SUPABASE_URL=<url-do-SGA> --dart-define=SUPABASE_PUBLISHABLE_KEY=<chave-publica>
```

As duas definições são públicas; nunca incluir service_role ou segredos de
servidor. A validação CI compila sem configurações de produção e mostra um
estado de configuração pendente. O artefacto CI não é uma release institucional.
O gateway usa a mesma origem no Web; apps Android/iOS ainda precisam de
configuração de origem HTTPS e política CORS explícita. Não estão empacotadas.
O pubspec.lock está versionado a partir da primeira resolução executada.

Backend isolado (não montado): `node --experimental-strip-types --test
backend/*.test.mjs` — 39 testes.

## Pendências de paridade antes de substituir o domínio

- Fonte Inter empacotada, iconografia equivalente, wordmark original e Rive.
- Login por ID/B.I., recuperação, OAuth, passkeys e migração da sessão React
  para Flutter (não ler tokens directamente de localStorage nem de URLs).
- Próxima aula pelo relógio de Luanda; horários por dia; calendário
  de presenças reais (um horário não prova presença); páginas de actividades.
- Marcação de avisos como lidos, anexos e notificações push; notas do perfil
  professor e do encarregado dependem de contratos de privacidade próprios.
- Detalhe de disciplina, tarefas/entregas, chat/histórico/anexos/Realtime,
  propinas, recibos, documentos e funcionalidades docentes completas.
- Notas: exames/recursos, boletim oficial e histórico ficam no portal; este
  cliente mostra o que a escola publicou, sem recalcular nem arredondar.
- Perfis encarregado/administrador requerem contratos próprios: a API actual
  apenas oferece aluno/professor. Não atribuir permissões artificiais.
- Lógica de aprendizagem inspirada no Moodle; nenhuma integração Moodle,
  duplicação de notas ou nova base de dados foi implementada.
- Fotografias de perfil, progresso por disciplina e entrada directa na aula:
  dependem de contratos próprios e não são simulados neste cliente.
- Acessibilidade completa: teclado, zoom, leitor de ecrã e contraste validados
  em todos os ecrãs; só parte está coberta por semântica explícita.
- Offline apenas quando houver política para dados sensíveis: sem cache
  académica/service worker neste incremento.

## Publicação reversível

O domínio é servido por mobile-v4/deployment/domain-worker.mjs; o seu
PAGES_ORIGIN aceita apenas previews do projecto siga-plus-mobile-v4. Não mudar
DNS nem eliminar o Worker. Primeiro compilar Flutter com configuração pública,
empacotar o backend/worker existente com os assets Flutter e publicar preview
isolado no mesmo projecto, mantendo bindings de servidor fora dos assets.
Validar MFA, vínculos e paridade com contas autorizadas; medir abertura, scroll,
teclado e acessibilidade em Android de entrada; só então apontar PAGES_ORIGIN
para a nova versão fixa. Registar a origem anterior e testar rollback.

## Validação desta entrega

SDK ausente no executor; download do SDK devolveu 404. Testes incluídos para
sessão ausente, resposta de outra escola, mudança de escola durante pedido,
403, salto e movimento reduzido. Execução/análise/build dependem do workflow
mobile-flutter.yml. Não declarar estes testes aprovados sem o resultado CI.

## Refinamento 2 — 13/10/2026

Dashboard com aula prevista em curso/próxima de hoje (horários publicados,
validade e UTC+1), três disciplinas e cinco actividades ordenadas por prazo.
Horários navegáveis por dia com Hoje, pesquisa e indicação de dados legados.
Ficha de disciplina em bottom sheet com docente e actividades publicadas.
Não deduz presenças nem cumprimento de tarefas. Catálogo incompleto/inválido
produz erro explícito em vez de listas vazias. Tema persistido, largura máxima
720 px, contexto reinicializado em nova verificação de sessão. Login valida
campos e remove senha do controller antes da chamada. Refresh trata falhas.
Gradiente da introdução dissolve com alpha aplicado às cores do shader.

Novos testes Dart cobrem mudança de dia em Luanda, validade, exclusão de
horários legados da próxima aula, referência a disciplina fora do catálogo e
catálogo incompleto. **Não executados:** Flutter/Dart continuam ausentes.
Verificação local de diff sem whitespace inválido; ZIP verificado sem erro.
Histórico/chat completo, avisos, notas/propinas e morph original seguem pendentes.
Nenhum push nem alteração de domínio nesta revisão.

## Expansão 3 — Turmas e tarefas

Páginas protegidas /more/classes, /more/classes/:id e /more/tasks. Turmas
agrupadas pelo classGroupId real; detalhe com disciplinas e horário de hoje.
Tarefas com pesquisa, instruções e prazo. Sem botões de envio fictícios nem
links WhatsApp/Zoom inventados. Matriz e plano em docs/AUDITORIA_E_PLANO.md,
com origem no código auditado e distinção entre código existente e operação
validada. Transporte, BBB e endpoints móveis das integrações continuam por
implementar. Build/testes Dart continuam sem execução neste ambiente.

## Backend — incremento 4

Detalhes em docs/BACKEND.md. API de turmas versionada e adaptador para o
catálogo existente montados no Worker de staging local; guardas de transporte
e integrações em backend/. 20 testes Node executados e aprovados. Não confundir
com Flutter/Worker compilados ou Supabase remoto validado. O ZIP inclui os dois
ficheiros de integração no repositório, além do cliente e backend isolado.
