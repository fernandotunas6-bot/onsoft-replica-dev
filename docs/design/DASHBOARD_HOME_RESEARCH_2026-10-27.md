# SIGA Plus — pesquisa de referência e Início operacional (27/10/2026)

## Âmbito e diagnóstico

O Início de gestão `/` é uma porta de trabalho, não uma capa promocional nem um painel de BI isolado. O SIGA Plus possui vários portais por papel. A iteração aqui documentada cobre **apenas o portal administrativo** e conserva o router, as consultas existentes, o isolamento escolar, as permissões e os módulos especializados.

A PR #372 (já integrada) introduziu `AdminHomeFocus` com contagens existentes e autorizadas. No estado analisado em `main` em 27/10/2026, as prioridades só eram exibidas no desktop, as seis acções rápidas estavam disponíveis apenas no mobile, e vários cartões estatísticos ampliavam 1,02x ao passar o rato, contrariando a nova directriz de controles discretos. Não se identificou necessidade de uma nova API ou de outra coluna/sidebar.

## Referências internacionais verificadas

| Plataforma | Padrão comprovado | Tradução para o SIGA Plus |
| --- | --- | --- |
| Canvas LMS | Vistas por cartões, lista de tarefas e actividade recente; barra lateral de tarefas | Acesso rápido às operações escolares e prioridades accionáveis por perfil |
| Moodle | Timeline, calendário e recentemente acedidos; blocos com informação de progresso e prazos | Continuar a usar os cartões existentes de «Hoje na escola», calendário e ano lectivo |
| Linear (redesign 12/03/2026) | Conteúdo central com mais destaque que navegação; separadores compactos, ícones e bordas discretas | Evitar cartões a saltar/escala e efeito decorativo que distraia |
| Notion Home | Eventos próximos, itens recentes, favoritos e tarefas personalizáveis | Evolução futura condicionada a dados reais e privilégios, sem simular actividade |
| Stripe Dashboard | Resumo operacional de informação essencial e entrada nas tarefas financeiras | Indicadores relevantes com destino claro para acção, sem promessas financeiras falsas |

Fontes oficiais:
- Canvas: https://community.instructure.com/en/kb/articles/664620-how-do-i-use-the-dashboard
- Moodle: https://docs.moodle.org/405/en/dashboard
- Linear: https://linear.app/now/behind-the-latest-design-refresh
- Linear Inbox: https://linear.app/docs/inbox
- Notion Home: https://www.notion.com/pt/help/navigate-with-the-sidebar
- Stripe Dashboard: https://support.stripe.com/questions/using-the-stripe-dashboard

## Ordem de leitura proposta

**Desktop:** saudação e identidade da escola → O que merece atenção → Acesso rápido → vistas analíticas → operação de hoje, calendário, KPIs e gráficos já existentes.

**Mobile:** avisos → O que merece atenção em formato compacto → números essenciais → acções rápidas → separadores/vistas e conteúdo restante.

A hierarquia dá primeiro a resposta: «o que devo fazer?» e depois «como está a escola?». Respeitar os destinos autorizados e as métricas reais. Nunca considerar falta de dados sinónimo de zero.

## Alterações desta iteração

1. `AdminHomeFocus` ganha variante compacta para mobile, com as mesmas fontes de dados e regras de acesso.
2. `QuickActions` ganha variante compacta para desktop, sem mexer no aspecto mobile antigo.
3. O portal administrativo reutiliza as mesmas acções autorizadas em ambos os formatos; a grelha de desktop é contextual, não um catálogo de todos os módulos.
4. Acções no cabeçalho passam também a considerar `grants`, não apenas o papel.
5. Cartões estatísticos abandonam `hover:scale` e sombras reactivas; o elemento realmente navegável mantém hover/foco discretos.
6. As vistas passam a apresentar áreas coerentes: visão geral com contexto diário, desempenho com gráficos académicos, financeiro com os montantes já confirmados e auditoria apenas para perfis com `capabilities.audit`.
7. A auditoria usa `auditActivity`, derivado dos mesmos `audit_logs` já consultados no overview da escola, isolado de `recentActivity`. Não exibe métricas artificiais como `operationalEfficiency: 100` nem interpreta recibos como auditoria.
8. Os resumos financeiros não substituem a confirmação do fornecedor nem o estado financeiro da aplicação; são somente leitura das contagens já presentes.

Sem SQL, novas dependências, novos dados, alterações de rotas ou migrações.

## Critérios de aceitação e limites

- [ ] `typecheck`, lint, Vitest, build e CI da PR aprovados.
- [ ] Verificar as vistas Geral / Desempenho / Financeiro / Auditoria, incluindo o caso sem logs de auditoria.
- [ ] Confirmar que o utilizador sem `capabilities.audit` não vê o botão de Auditoria e que os logs são estritamente da escola activa.
- [ ] Ecrãs 390, 768, 1024 e 1440 px; sem overflow horizontal.
- [ ] Testar teclado, foco visível, toque e movimento reduzido.
- [ ] Verificar administrador e funções com grants limitados para não revelar atalhos não autorizados.
- [ ] Verificar escola sem dados e falha de carregamento; não inventar contagens.
- [ ] Regressão da ordem do Início mobile e das páginas dos professores, alunos e encarregados.
- [ ] Confirmar em staging autenticado antes da fusão; não publicar directamente em produção.

**Importante:** a pesquisa documenta padrões de outras plataformas; não implica reprodução do seu design, da sua marca ou de código de terceiros. Rege-se pelo `docs/design/VISUAL_MASTER_2026.md` e pela matriz `VISUAL_MASTER_STATUS.md`.
