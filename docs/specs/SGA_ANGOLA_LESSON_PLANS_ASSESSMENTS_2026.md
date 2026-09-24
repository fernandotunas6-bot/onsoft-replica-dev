# SIGA Plus — planos de aula, avaliações e exames no contexto angolano

**Pesquisa:** 24-09-2026. **Estado:** especificação e motores puros com testes escritos no PR #26; não integrado à API nem publicado em produção.

## Fontes e vigência
- Decreto Presidencial n.º 162/23, artigo 53.º, regime jurídico do ensino geral: https://lex.ao/docs/presidente-da-republica/2023/decreto-presidencial-n-o-162-23-de-01-de-agosto/
- Decreto Executivo n.º 106/26, de 27-04-2026, Regulamento da Avaliação das Aprendizagens (RAA), que revoga o Decreto Executivo n.º 424/25: https://www.angolex.com/paginas/decreto-executivo/regulamento-da-avaliacao-das-aprendizagens-dos-subsistemas-da-educacao-pre-escolar-ensino-geral-e-educacao-de-adultos-raa-106a-26a.html
- Decreto Executivo n.º 686/25, calendário escolar 2025/2026, referência **histórica**, não reutilizar as datas em 2026/2027: https://lex.ao/docs/ministerio-da-educacao/2025/decreto-executivo-n-o-686-25-de-26-de-agosto/
- Regulamento dos Exames Nacionais, Decreto Executivo n.º 377/25; calendário de cada edição definido por edital: https://lex.ao/docs/ministerio-da-educacao/2025/decreto-executivo-n-o-377-25-de-07-de-abril/
- O calendário 2026/2027 circula em cópias de ofícios; obter diploma e anexos oficiais autenticados antes de introduzir datas obrigatórias. Não importar datas de páginas sem verificação.

## 1. Planificação curricular e plano de aula do docente
Hierarquia: programa curricular oficial por nível/classe/disciplina → dosificação anual e trimestral → unidade temática e objectivos → plano de aula versionado → ocorrência do horário publicado → execução e evidências → avaliação contínua → revisão do coordenador e da subdirecção pedagógica.

Cada plano guarda escola, ano, período, classe, turma, disciplina, docente, versão curricular, unidade, objectivos mensuráveis, pré-requisitos, metodologia, recursos, diferenciação, avaliação diagnóstica/formativa/sumativa, critérios, tarefas, minutos, referências e assinatura de aprovação. Alterações após aprovação geram nova versão; preservar versão usada na aula, com autor, timestamps e motivo. Aulas repostas e substituições exigem autorização própria. Uma leitura QR apenas prova uma evidência administrativa de presença, nunca comprova que o conteúdo foi efectivamente leccionado.

Estados recomendados: rascunho → submetido → aprovado/devolvido → programado → leccionado/parcial/cancelado → reconciliado ou pendente de revisão. A divergência entre plano e execução deve originar acompanhamento pedagógico, não desconto automático.

## 2. Regras de avaliação por subsistema e classe
O RAA 106/26 aplica-se ao pré-escolar, ensino primário, ensino secundário geral e educação de adultos em instituições públicas, público-privadas e privadas. Configurar regras com identificador do diploma, vigência, nível, ciclo, classe, disciplina e modalidade. Não copiar regras do ensino geral para técnico-profissional, formação de professores ou ensino superior sem diploma próprio.

- Pré-escolar: avaliação qualitativa, formativa e diagnóstica, sem retenção por notas; relatório de desempenho da criança.
- Ensino primário: 1.º e 2.º ciclos qualitativos/descritivos; III ciclo combina qualitativo e quantitativo; escala quantitativa de 1 a 10 quando aplicável.
- Secundário geral: escala de 0 a 20, classificação qualitativa complementar. Aplicar fórmulas do Anexo III da versão normativa em vigor, sem inventar pesos.
- Avaliação contínua: responsabilidade do professor, supervisionada pela coordenação/director de turma e subdirecção pedagógica.
- Provas trimestrais: fluxo de elaboração/revisão/aprovação sob subdirecção pedagógica e supervisão externa aplicável ao nível/classe. Não permitir que o professor publique unilateralmente provas institucionais.
- Exames nacionais: 6.ª, 9.ª e 12.ª classes, conforme disciplinas e edital do MED em cada edição. Exames de recurso, extraordinários, equivalência e melhoria de nota são modalidades distintas com inscrições e condições específicas.
- A reapreciação dos resultados finais deve admitir pedido fundamentado no prazo legal aplicável (RAA 106/26, artigo 38.º: até 48 horas após publicação), preservando publicação, recepção, decisão, comissão e trilho de auditoria. Exames nacionais seguem regulamento próprio.

## 3. Calendário de avaliações e exames
Distinguir períodos lectivos, janelas de avaliação contínua, provas trimestrais, pausa pedagógica, conselho de notas, publicação, reclamação, exame nacional por chamada, recurso e exames extraordinários. Guardar fonte oficial, edição, versão e estado confirmado/provisório.

A programação deve verificar simultaneamente: datas da janela e do período, feriados, disponibilidade da turma, sala e vigilantes, capacidade e acessibilidade, duração e tolerância do exame conforme edital, elegibilidade de classe/disciplina, ausência de duplicações, limite diário de provas aprovado pela escola e conflitos com aulas. O limite de duas provas/dia usado nos exemplos é uma **configuração pedagógica ilustrativa**, não uma imposição legal genérica.

Para 2026/2027, só publicar datas quando o calendário nacional oficial e os editais relevantes estiverem verificados; nunca copiar automaticamente o calendário 2025/2026. Mudanças oficiais geram versão e revalidação das sessões já marcadas.

## 4. Conciliação e fecho
Plano curricular → aula datada publicada → plano aprovado → evidência de entrada/saída → registo do conteúdo realmente leccionado → avaliação associada aos objectivos → relatório de cumprimento do programa → coordenação pedagógica → fecho de período. Avaliação não deve ser lançada em período errado, nem publicada antes da validação e do conselho de notas aplicável.

Separar três indicadores: (1) presença administrativa do docente; (2) execução pedagógica do plano; (3) aprendizagem demonstrada pelos alunos. Não transformar notas baixas em prova de ausência docente, nem QR em prova de aprendizagem. Reposição curricular, ensino inclusivo e avaliações especiais requerem revisão humana.

## 5. Controlo de produção pendente
Criar tabelas multi-tenant com school_id, academic_year_id, period_id, published_schedule_version, subject_id, curriculum_version e trilho de auditoria. A API deve aplicar autorização por perfil, RLS e transações para publicação e fecho. Integrar os motores lessonPlanReconciliation.ts e assessmentCalendar.ts com a UI e persistência. Executar Vitest, typecheck, build, testes de integração e de concorrência antes de activar funcionalidades ou migrar produção.
