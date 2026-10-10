# SIGA Plus — Especificação de refinamento visual v3

## Mantido
- Estrutura original inspirada nas referências fornecidas; sem redesenhar o dashboard.
- Navegação inferior flutuante, bottom sheets, selector de escola, gradientes atmosféricos.

## Implementado
- Motion de entrada dos painéis e conteúdo, easing uniforme e feedback de toque.
- Ícones SVG de traço consistente e estados activos mais legíveis.
- Foco visível, acessibilidade com movimento reduzido e adaptação a ecrãs estreitos.
- Estado inicial sem projectos escolares fictícios; limpeza do estado demonstrativo ao mudar de escola.
- Sanitização básica do nome de novos projectos inseridos no HTML.

## Pendente para produção
- Integração com sessão, vínculos e permissões reais, isolamento de dados no servidor (RLS).
- Persistência de projectos, conversas, favoritos, definições e anexos.
- Testes reais em Android/iOS, teclado virtual, zoom 200%, VoiceOver/TalkBack.
- Auditoria de contraste nos temas e testes de desempenho do gradiente em dispositivos fracos.
- Acções de menu demonstrativas ainda precisam de serviços backend.

## Critérios de aceite
1. Sem escola: «Por seleccionar»; sem dados de escola.
2. Troca de escola: não manter projectos ou conversas da escola anterior.
3. Motion reduzido: não animar continuamente.
4. Menus e navegação funcionam sem quebrar o layout a 320px.
5. Nunca usar a lista do cliente como autorização de acesso: validar no servidor.


## V4 — App quotidiana professor/aluno (09-10-2026)
- Novo separador **Meu dia**, sem alterar os três separadores originais.
- Alternância demonstrativa entre Professor e Aluno; **não representa autorização**.
- Professor: aulas, presenças, notas, turmas, planos, tarefas, mensagens, calendário.
- Aluno: horário, notas, trabalhos, disciplinas, presenças, avisos, mensagens, documentos.
- Estado sem escola: «Por seleccionar», sem dados académicos fabricados.
- Detalhes de módulo em bottom sheet, claramente identificados como protótipo.

### Contrato de integração necessário
1. Autenticar sessão no SIGA Plus e recuperar vínculos activos e papéis autorizados no servidor.
2. Listar escolas autorizadas via API; confirmar `school_id` no servidor em cada requisição.
3. Resolver permissões professor/aluno por escola e não por alternância visual.
4. Expor endpoints de leitura para agenda, turmas, presenças, notas e tarefas, com RLS.
5. Expor mutações de presenças/notas com validação, auditoria e estados de período.
6. Incluir estados de loading, vazio, erro, offline e revalidação após troca de escola.
7. Testar Android/iOS, teclado, zoom, acessibilidade e ausência de fuga entre tenants.

**Não integrado:** backend, autenticação, dados reais, gravação de notas/presenças ou publicação.

## V5 — Refinamento visual e ícones (10-10-2026)
- **Tema escuro reposto:** os blocos `#app …` do refinamento anterior sobrepunham-se a `.dark …` (barra inferior branca, texto secundário sem contraste, papel activo invertido). Regras `#app.dark` no fim do CSS, sem tocar no original.
- **Ícones:** mantêm-se os desenhos e a atribuição originais (pedido do utilizador). Uma primeira versão com ícones novos por serviço foi revertida.
- **Sem cor por função:** a cor por serviço e o ícone em relevo (3D) foram experimentados e retirados a pedido do utilizador. Fica o ícone original numa só cor de destaque (`--v5-accent`). Fica o movimento: os mosaicos entram em cascata (32 ms entre eles) e o ícone sobe ligeiramente ao passar; nada anima com «Reduzir movimento».
- **Mosaicos e agenda:** seta sempre no canto, toque com ligeira compressão, agenda com uma linha por actividade e a hora em destaque. Espaço inferior reservado para a barra com a margem segura do iPhone.
- `tests/icons.test.ts`: todos os ícones usados existem (nenhum cai no «?»), cada serviço de um perfil tem ícone diferente, e cada ícone é só traço, sem cores nem scripts.
- Revisto em Chromium a 390 px, claro e escuro, professor e aluno, sem erros JS. Continua por rever em Android/iOS físicos e com leitores de ecrã.

### Funções de cada perfil (`domain/agenda.ts`, `components/AcademicCatalog.tsx`)
| Função | Antes | Agora |
|---|---|---|
| Horário / Aulas | cartões soltos | por dia, a começar em hoje, cada dia por hora; no dia de hoje «A decorrer» e «A seguir» (relógio de Luanda). Continua a ser o horário publicado, não a aula realizada |
| Trabalhos / Tarefas | lista sem ordem | «Por entregar» do prazo mais próximo («Hoje», «Amanhã», «Faltam N dias»; sem prazo no fim) e «Prazo terminado» à parte. Não sabe das entregas |
| Turmas (professor) | «Ver horário», «Ver trabalhos» | resumo «N períodos por semana · N trabalhos por entregar», mais «Fazer chamada» e «Ver notas» |
| Disciplinas (aluno) | só a matrícula | o mesmo resumo e «Ver notas»; sem chamada |

`tests/agenda.test.tsx` cobre o relógio de Luanda, a ordem dos dias, os estados da aula, os prazos e a navegação de cada perfil.

