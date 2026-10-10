# SIGA Plus Mobile V4

Aplicação React + TypeScript isolada em `mobile-v4/` dentro do repositório SIGA Plus. Não modifica a aplicação raiz, SQL, rotas, autenticação existente, configurações de deploy ou produção.

## Executar

Node 24. Dentro de `mobile-v4/`:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Porta exclusiva 5180; não colide com as cinco aplicações do ecossistema.

## Fonte e preservação

Os anexos efectivamente recebidos foram `index.html` e `REFINAMENTO.md`, não um ZIP. `reference/original.html` e `reference/REFINAMENTO.md` são cópias intactas desses anexos. O CSS e os SVGs foram extraídos directamente do primeiro modelo: navegação de quatro ícones, gradientes atmosféricos, selector escolar, painéis inferiores e aspecto da página inicial. As alterações CSS estão num bloco aditivo no final de `src/styles.css`.

O selector foi mantido por instrução expressa do utilizador. Esta aplicação isolada não altera o comportamento single-school da aplicação principal.

## Percursos da demonstração explícita

1. Início → Meu dia → Testar como professor → Seleccionar escola → Escola de teste A.
2. Aulas → Fazer chamada → confirmar presentes/ausentes/justificados → Lançar notas → aluno → nota 0–20 → guardar ou publicar.
3. Plano de aula → objectivos/materiais → guardar → editar.
4. Tarefas → publicar com prazo → alternar para Aluno → seleccionar a mesma escola → Trabalhos → entregar/actualizar → alternar para Professor → rever entregas.
5. Aluno → horário, disciplinas, notas publicadas, presenças, avisos, mensagens e pedido de documento.
6. Professor/aluno → mensagens para contactos académicos → trocar de perfil → consultar recebidas.
7. Conta → Aparência → tema e três fundos; preferências locais são as únicas informações persistidas no browser.
8. Início → criar projecto local; lista, pesquisa, favorito, cópia, edição e exclusão. Não é um gerador IA e não cria entidades no SIGA.

Os registos académicos de teste vivem em memória; um recarregamento elimina-os. Trocar de escola limpa imediatamente a vista, os projectos e os formulários. Os registos da demonstração permanecem separados por escola no serviço de teste, para verificar os percursos entre professor/aluno. As escolas de teste só aparecem após escolha explícita da demonstração.

## Consulta institucional de pautas

Na ligação autenticada, Aluno → Notas consulta `GET /api/mobile-v4/schools/:schoolId/results?role=aluno`. Apenas pautas no estado `published` com data de publicação e linhas das próprias matrículas activas são projectadas. A página permite filtrar pauta anual/de período e actualizar. Apresenta as médias e o resultado armazenados na pauta; não calcula notas por disciplina nem presume uma escala de 0–20. Valores nulos aparecem como “Sem média publicada” e zero continua zero. As observações, detalhes privados, rascunhos e dados de colegas não são seleccionados. A consulta de diários atribuídos do professor também está disponível; as escritas académicas permanecem pendentes. Relatório: `docs/RELATORIO_PAUTAS_2026-10-10.md`.

## Arquitectura

- `src/components`: SVGs originais, painel com foco/teclado, interfaces académicas.
- `src/domain`: contratos e regras de autorização/validação.
- `src/services/demo.ts`: serviço de teste com dados fictícios e mutações.
- `src/services/api.ts`: adaptador HTTP para o contrato proposto, desactivado no entrypoint.
- `src/App.tsx`: shell e navegação, sessão/contexto, carregamento, estados e cancelamento.
- `tests`: regras académicas, acesso por escola, integração React e adaptador HTTP.
- `scripts/pwa.mjs`: gera service worker versionado após o build.
- `docs/PLANO.md`: análise e sequência de implementação.
- `docs/INTEGRACAO.md`: contrato e critérios para ligação real.

## PWA

Manifesto, PNGs 192/512 e service worker de âmbito relativo. Servir `dist/` em HTTPS ou localhost. O service worker guarda apenas ficheiros do shell compilado; não guarda sessão, chamadas API, notas ou presenças. A instalação depende do suporte do browser. Em Android, usar a opção Instalar do browser ou da conta quando disponibilizada; em iOS, Partilhar → Adicionar ao ecrã principal. Um pacote ZIP ou `file://` não activa a PWA.

Sem ligação, o shell abre após uma primeira visita bem-sucedida; dados institucionais ficam indisponíveis e não há fila de escritas offline. Dados reais nunca devem ser convertidos em sucesso local fictício.

## Limites desta versão

O preview ligado usa a sessão Supabase Sga existente, login/TOTP, API autenticada, catálogo académico, presenças e pautas publicadas próprias do aluno. A publicação actual e os ensaios estão descritos no PR #116 e nos relatórios de cada ciclo. Não houve migrações na produção nem validação positiva com contas reais autorizadas. Diários do professor, próximas aulas, propinas/recibos próprios, acesso ao PayFlow e consultas do chat/anexos foram acrescentados. Os comandos do chat estão preparados e ensaiados em PostgreSQL local, mas aguardam instalação/validação num ambiente autorizado. Avisos: marcar como lido (um ou todos, com 2FA) e avisos mais antigos por cursor — ver `docs/RELATORIO_AVISOS_2026-10-10.md`. Upload de ficheiros, escritas académicas, emissões oficiais e notificações push continuam pendentes. Relatório: `docs/RELATORIO_FUNCOES_2026-10-10.md`. Conectores, suporte, comunidade, pedidos de vínculo e acções de desenvolvimento IA conservam painéis de informação e indicam a integração pendente. Não afirmar segurança de produção a partir das guardas do browser: a autorização efectiva é do servidor existente.

Revisão visual em dispositivos reais, TalkBack/VoiceOver, teclado virtual, zoom 200%, contraste e desempenho dos gradientes ainda pendente. Os testes React usam jsdom; não equivalem a validação visual Android/iOS.

## Páginas novas a partir das referências

Conta → Perfil abre `#/perfil`: capa em gradiente, avatar por iniciais, informações escolares, mapa anual e rodapé em duas colunas. Conta → Menu de serviços abre o menu de ecrã inteiro; Todos os serviços abre `#/servicos`. A marca nas páginas é SIGA Plus; não há links de marketing do Lovable.

Cada serviço abre uma página completa com o mesmo cabeçalho/rodapé. URLs hash preservam a navegação Voltar do browser sem requerer rotas novas no servidor. Rodapé, menu e atalhos levam a destinos escolares reais na aplicação: aulas/horário, calendário, notas, trabalhos, chat, avisos, documentação, instalação e páginas de informação escolar. As permissões de escrita continuam no serviço/servidor.

Calendário → mapa mensal; Perfil → mapa anual. Azul = presença, vermelho = falta, âmbar = justificada, ponto dividido = registos mistos, cinzento = por registar. Clicar num dia mostra aulas e estados. Setas do teclado percorrem dias, e mudar de mês selecciona o primeiro dia desse mês. O mapa do professor usa registos docentes separados. No modo de teste iniciado pela interface, aparecem exemplos fictícios das cores; sem escola não aparecem dados académicos.

Conversas → contacto → chat com balões, horas de Luanda e envio. A página Mensagens usa o mesmo componente. No preview ligado, o chat consulta as conversas autorizadas do Sga existente, com paginação, respostas e anexos recebidos. Não copia dados fictícios para o Sga. A habilitação de envio, eliminação, leitura e nova conversa depende da RPC proposta para testes; a migração não foi aplicada à produção.
