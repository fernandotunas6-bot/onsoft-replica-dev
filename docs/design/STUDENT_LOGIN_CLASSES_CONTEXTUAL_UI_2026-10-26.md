# SIGA Plus — Estrutura Visual Oficial: Login, Pessoas, Alunos e Turmas (PR #339)

**Estado:** especificação de UI/UX para implementação incremental; nenhum dos wireframes nesta página prova que a rota proposta exista.  
**Precedência:** `docs/design/VISUAL_MASTER_2026.md` e `SIGA_VISUAL_MASTER_2026-10-23.md` continuam obrigatórios. Isto é um *aditamento específico*, não um design system concorrente.  
**Referência de execução:** `.cursor/skills/siga-alunos-ano-lectivo/SKILL.md` e `references/PROMPT_MASTER.md`.

## 1. Mapa da navegação e disponibilidade

| Contexto | Entrada de hoje | Experiência pretendida | Status |
| --- | --- | --- | --- |
| Login geral | `AuthGate.tsx` | Identificador/BI/ID + senha, escola do hostname, MFA, erro discreto | **Existente**, com correcções iniciais na PR |
| Pessoas | `/pessoas` | Cadastro unificado, pesquisa, vínculo, preparar novo ano | Cadastro **existente**; botão/página de preparação **propostos** |
| Alunos | `/alunos` | Lista por ano com ID oficial, estado, turma, contexto | Lista/ID **existentes**; uniformização pendente |
| Aluno individual | `/alunos/$studentId` | Ficha contextual, secções por permissão, histórico | **Existente**, não criar outra ficha |
| Turmas | `/pedagogica?tab=turmas` | Estrutura e ficha de turma; A–Z por ano/classe | **Existente**; alocação etária não está ligada |
| Renovar turma | `/pedagogica/turmas/$turmaId/renovar` (via rota existente) | Resultado final, preparação e renovação, ID na lista | **Existente**, ID acrescentado nesta PR |
| Preparar ano | **Rota a definir no router actual** | Pessoas → plano de rematrícula por ano e elegibilidade | **Proposto** |
| Organizar turmas | **Rota a definir no router actual** | Simular política A–Z, revisão, publicação autorizada | **Proposto**, planeador puro já criado |
| Portal aluno | `/portal` e portal institucional | Minha turma, disciplinas, horário, presenças e documentos | **Existente**, validar contexto e acesso |

Não criar novas páginas com links hardcoded sem actualizar o catálogo autorizado de navegação e testes. Examinar o contexto existente (e a integração pendente de #332) antes de escolher rotas. O nome de uma rota proposta só passa a contrato quando implementado e testado.

## 2. O percurso visual de ponta a ponta

```text
[Site da escola] --- Entrar no Portal ---> [LOGIN]
                                           │ ID escolar / BI / e-mail + senha
                                           │ MFA/captcha quando aplicável
                                           ▼
                                  [Portal do Aluno]
                                  Minha turma · Horário · Notas

[Secretaria / Administração]
  └─ Pessoas (cadastro permanente)
       └─ Preparar ano lectivo [página proposta]
           ├─ Seleccionar ano/classe/curso/turno
           ├─ Elegíveis / retidos / sem decisão / transferidos
           └─ Organizar turmas [página proposta]
                ├─ Simular A-Z [primeiro os mais novos]
                ├─ Rever conflitos e lotação
                ├─ Confirmar (somente quando backend seguro existir)
                └─ Turma X → Lista / ficha do aluno / documentos
```

Separação visual: a equipa trabalha na gestão académica; o aluno autenticado vê só o portal pessoal e as turmas em que está realmente inscrito.

## 3. Página de LOGIN — wireframe de referência

```text
┌──────────────────────────────────────────────────────────────┐
│ [S SIGA] Escola / Portal académico                          │
│                                                              │
│       Bem-vindo ao seu portal                                │
│       Entre com os dados da sua conta                        │
│                                                              │
│       Identificador                                          │
│       ┌─────────────────────────────────────────────┐        │
│       │ ID do aluno, BI ou e-mail                   │        │
│       └─────────────────────────────────────────────┘        │
│       Senha                                                  │
│       ┌─────────────────────────────────────────────┐        │
│       │ •••••••••••                           [olho]│        │
│       └─────────────────────────────────────────────┘        │
│       [ ] Recordar identificador       Recuperar senha       │
│                    [ Entrar ]                                │
│          Mensagem curta / suporte / acessibilidade            │
└──────────────────────────────────────────────────────────────┘
```

- Sem sidebar administrativa, tabelas, cards decorativos ou formulário de matrícula dentro do login.
- Detectar portal escolar por hostname fiável. O selector de escola aparece **apenas** quando necessário, nunca expondo candidatos ou e-mails alheios.
- Estados: vazio, validando, submetendo, captcha exigida, MFA, sessão expirada, identificador/senha inválidos (mensagem comum), ligação indisponível, escola sem vínculo.
- A mesma estrutura responde em mobile com uma coluna, campos largos, foco visível e teclado correcto. Não adicionar vídeo de entrada; conservar branding/animação autorizados.

## 4. Layout institucional comum

```text
┌───────────────┬───────────────────────────────────────────────────────────────┐
│ SIGA PLUS     │ [Escola activa ▾]   [Ano lectivo ▾]            [Conta ▾]       │
│               ├───────────────────────────────────────────────────────────────┤
│ Contexto      │ Breadcrumb: Pessoas / Preparar 2027 / Turmas / 10.ª          │
│ seleccionado  │ Título contextual e 1 acção principal                         │
│               │ ┌─────────────────────────────────────────────────────────┐   │
│ • Registo     │ │ Filtros necessários e métricas breves                    │   │
│ • Preparar    │ │ Tabela ou lista da tarefa seleccionada                  │   │
│ • Histórico   │ │ Empty/loading/error, rodapé/paginação claros            │   │
│               │ └─────────────────────────────────────────────────────────┘   │
│ Voltar        │                                                               │
└───────────────┴───────────────────────────────────────────────────────────────┘
```

**Borda e sidebar:** lado exterior esquerdo **recto até ao ecrã**; lado direito junto ao main content com curva **côncava/inversa**, sem espaço visível. A cor e o raio são do token da marca/tema. Nunca criar uma segunda sidebar. O nível de contexto entra no menu apenas depois de validado pelo servidor.

Uma página = uma função principal. Se o utilizador entrar na turma, o menu passa a **turma**; se entrar numa ficha, passa a **aluno**; ao voltar, reconstitui a escola/ano autorizados. Fechar menus compactos depende do comando, não hover involuntário.

## 5. Pessoas — preparar novo ano (página nova, não modal)

```text
Pessoas / Preparar Ano Lectivo
Preparar 2027                   [Simular preparação]
[Escola: ...] [Ano de origem 2026] [Destino 2027]

[Elegíveis 184]  [Retidos 12]  [Sem resultado 3]  [Excluídos 4]

[PESQUISAR nome ou ID] [Classe ▾] [Curso ▾] [Turno ▾] [Estado ▾]
┌─────────┬─────────────────┬───────────────┬─────────┬───────────┐
│ ID      │ Nome            │ Classe 2026   │ Resultado│ Destino  │
├─────────┼─────────────────┼───────────────┼─────────┼───────────┤
│1260001  │ Estudante A     │ 9.ª A         │ Aprovado │ 10.ª, -- │
│1260002  │ Estudante B     │ 9.ª B         │ Retido   │ 9.ª, --  │
└─────────┴─────────────────┴───────────────┴─────────┴───────────┘
             [Rever pendentes]   [Organizar turmas →]
```

*Os valores acima são demonstrativos, não dados reais.*

- O aluno **não sai** de Pessoas em nenhum momento; o que aparece é o seu estado de matrícula perante o novo ano.
- Separar elegíveis, transferência, retenção, conclusão e decisões pendentes; nunca criar nova pessoa por rematrícula.
- ID de aluno sempre visível para a Secretaria. Não expor BI, data de nascimento ou telefone desnecessariamente nesta grelha.
- Cada acção abre **a página correcta** e mantém filtros via router/contexto autorizado.
- Ordenar, exportar e paginar com componentes existentes; não carregar a escola inteira no cliente.

## 6. Organizar Turmas — página dedicada (proposta)

```text
Pessoas / Preparar 2027 / Organizar turmas
Organização de Turmas                  [Simular distribuição]
[Classe: 10.ª ▾] [Curso: Geral ▾] [Turno: Manhã ▾]
[Regra: Mais novos primeiro — turma A ▾] [Referência: 01/02/2027]

A — 35 / 35       B — 35 / 35       C — 22 / 35
[Mais novos]      [Seguintes]       [Mais velhos]

[Todos] [A organizar] [Pendentes] [Colocação protegida] [Sem data]
┌─────────┬──────────────┬──────────────┬────────┬─────────────┐
│ ID      │ Aluno        │ Idade ref.   │ Actual │ Proposta    │
├─────────┼──────────────┼──────────────┼────────┼─────────────┤
│1260043  │ Estudante C  │ 13 anos      │ —      │ Turma A     │
│1260020  │ Estudante D  │ 14 anos      │ —      │ Turma B     │
│1260007  │ Estudante E  │ ?            │ —      │ Rever data  │
└─────────┴──────────────┴──────────────┴────────┴─────────────┘
[Excepções a rever]                     [Rever plano →]
```

**Nota:** os números de lotação no wireframe são **exemplos**, não a lotação legal. Usar a capacidade efectivamente autorizada para cada escola, sala e subsistema.

- A simulação produz apenas proposta, nunca grava.
- Comparar distribuição inicial/final antes de admitir confirmação. Mostrar o motivo de toda a exclusão ou conflito.
- Se o algoritmo não pode garantir A = mais novos porque existe colocação protegida ou turma publicada, revelar isso claramente.
- A acção final `Publicar` fica desactivada/ausente até backend seguro, teste AAL2, transacção e revisão institucional.
- Permitir deslocação manual justificada com auditoria, sem tornar a operação invisível; não revelar motivos sensíveis aos próprios alunos ou colegas.

## 7. Contexto da TURMA

```text
← Voltar ao Académico
Turma · 10.ª A
├─ Resumo
├─ Alunos                 [ID, nome, estado, acção]
├─ Disciplinas
├─ Horário
├─ Avaliações e pauta
├─ Trabalhos
├─ Presenças
├─ Materiais
└─ Renovar matrículas     [ano seguinte]
```

Não duplicar globalmente estas opções na sidebar quando a turma está aberta. Cada entrada aponta à rota/parâmetro existente ou nova rota efectivamente autorizada, preservando escola/ano. Abrir o aluno muda o contexto para aluno; breadcrumb permite voltar.

**Lista de turma:** `ID aluno` não é UUID; mostrar `student_number` canónico + nome + estado de matrícula + acções autorizadas, com filtros e exportações existentes. Datas de nascimento por papel restrito.

## 8. Contexto do ALUNO

```text
← Turma 10.ª A
Aluno · [ID escolar] [Nome]
├─ Identificação
├─ Académico
├─ Histórico por ano
├─ Documentos
└─ Financeiro             [somente papéis autorizados]
```

- O portal do aluno não recebe navegação de Secretaria nem dados financeiros globais.
- A ficha administrativa preserva os seus componentes existentes e mostra dados apenas da escola activa.
- O ano lectivo filtra o conteúdo anual, mas o histórico mantém todos os anos legítimos.
- Não transformar a ficha longa em uma sucessão de modais; usar as secções/contextos já criados quando a PR contextual estiver disponível.

## 9. Desktop / Tablet / Mobile

| Largura | Menu | Conteúdo | Acção |
| --- | --- | --- | --- |
| ≥ 1024 px | Sidebar contextual compacta à esquerda, côncava à direita | Tabelas com ID e colunas relevantes | CTA no cabeçalho e operações na linha |
| 768–1023 px | Sidebar recolhível com contexto activo | Tabela com scroll controlado ou colunas prioritárias | Botões de 44 px e estado inequívoco |
| ≤ 767 px | Navegação existente em `Mais`/gaveta, sem menu duplicado | Lista de alunos, ID e turma de fácil leitura | CTA principal visível, acções secundárias acessíveis |

Verificar adicionalmente 360, 390, 834, 1024, 1440; teclado físico/virtual, zoom 200%, acessibilidade de foco e reduced-motion. Preservar conteúdo/funcionalidade entre mobile e desktop.

## 10. Contrato visual de composição

- Tipografia Inter 400/500/600, sem uppercase ornamental e sem títulos gigantes.
- Ícones monocromáticos existentes de `src/lib/app-icons.ts`; cada conceito conserva o mesmo ícone em todo o produto.
- Tokens do tema actual, marca escolar sem apagar preferências do utilizador; claro/escuro com contraste verificado.
- Superfícies brancas/claras no tema claro; bordas finas, sombras mínimas e cartões **apenas** quando agregam informação.
- Distância uniforme entre cabeçalho, filtros, tabela, paginação e footer; sem margem exterior vazia entre sidebar e main.
- Inputs, selects e pesquisa usam componentes existentes; mostrar apenas filtros que pertencem à página.
- Estados `loading/empty/error/success` curtos; sucesso definitivo apenas após confirmação server-side.
- Prioridade ao tempo de toque e legibilidade; nenhum preload de tabelas enormes ou ícones pesados para login.
- Dialog/AlertDialog/ModalShell só para confirmações simples; processo de preparação/organização **é página**, não modal.

## 11. Estados e microinteracções a provar

1. Abrir `/pessoas` → contexto Pessoas e pesquisa rápida; clicar `Preparar` → contexto do ano seleccionado.
2. Mudar ano → alterar lista e breadcrumb, invalidar cache por `schoolId + academicYearId`, sem misturar escola anterior.
3. Simular turmas → feedback imediato, carregamento sem perder filtros, cartões de lotação consistentes e tabela estável.
4. Tentar publicar sem permissão/AAL2/ano preparado → bloquear no servidor, mostrar motivo sem expor dados.
5. Clicar nome da turma → contexto da turma; clicar aluno → contexto do aluno; voltar → preservar filtros autorizados.
6. Trocar escola → revalidar todos os contextos e esconder dados anteriores antes da nova leitura.
7. Entrar como aluno → portal restrito, sem links administrativos; login ID/BI ambíguo → erro não enumerável e orientação geral.
8. Rede lenta/sessão expirada → permitir retentar, não mostrar estado confirmado sem escrita efectiva.
9. Teclado, screen reader, movimento reduzido, 390/768/1024/1440px, claro/escuro e texto longo sem overflow.
10. Verificar visuais com contas e dados **de staging**; screenshots mock não equivalem a validação com RLS real.

## 12. Checklist de implementação visual

- [ ] Contratos visuais mestres consultados integralmente.
- [ ] Sem novo motor de sidebar/navegação.
- [ ] Cadastro Pessoas não duplica dados ou contas.
- [ ] Novas páginas possuem guardas de rota, breadcrumb, contexto e testes.
- [ ] Uma função por página; sem campos de outros módulos.
- [ ] ID escolar em todas as listas relevantes, incluindo versão mobile.
- [ ] Política de idade é configurável, e excepções são legíveis.
- [ ] Nenhuma publicação baseada na simulação pura.
- [ ] Formulários por teclado e touch, alvos e foco adequados.
- [ ] Tabelas paginadas e caches isoladas por escola/ano/papel.
- [ ] Evidências comparativas mobile/desktop com PR e commit.
- [ ] `docs/design/VISUAL_MASTER_STATUS.md` actualizado com provas reais, sem declarações fictícias.

**Resultado esperado:** contextos inequívocos, fluxo anual correcto, distribuição transparente, identidade escolar consistente e interface SIGA Plus sem ruído, fluida e segura.
