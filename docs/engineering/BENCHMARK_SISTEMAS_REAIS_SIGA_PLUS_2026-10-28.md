# SIGA Plus — pesquisa comparativa de sistemas escolares reais
Data: 28-10-2026 · Âmbito: matrícula, turmas, professores, notas/pautas, horários, cobrança, CRUD, ano lectivo · PR #378

> **Critério de pesquisa**: documentação oficial de produtos e manuais publicados dos próprios serviços, não uma suposição sobre ecrãs. Os factos observados estão identificados abaixo. As opções de engenharia SIGA Plus são propostas, não funcionalidades necessariamente presentes nesses concorrentes. Não reproduzir código, marca, dados ou interface proprietária de terceiros.

## 1. Sistemas analisados e práticas comprovadas

| Produto | Prática verificada | Fonte primária |
| --- | --- | --- |
| **PowerSchool SIS** | Selecção de alunos e matrícula em massa; saída da turma e transferência para outra; histórico de entrada/saída; separação entre notas correntes e notas finais armazenadas, editáveis por papéis restritos | https://ps.powerschool-docs.com/pssis-admin/latest/work-with-currently-selected-students · https://ps.powerschool-docs.com/pssis-admin/latest/school-enrollment-student-pages · https://ps.powerschool-docs.com/pssis-admin/latest/historical-grades |
| **Infinite Campus** | Teaching Center por período/turma com presenças e tarefas a avaliar; lista de alunos com estados **incoming / active / dropped**; perfil lateral do aluno com contactos, horário, notas e presenças; livros de notas e relatórios | https://kb.infinitecampus.com/help/campus-instruction-getting-started-study-guide · https://kb.infinitecampus.com/help/instruction-reports |
| **Moodle** | Pauta geral e **Single view** por aluno ou actividade; inserção em lote; notas manualmente substituídas identificadas; itens ocultos/bloqueados; relatório de histórico das notas | https://docs.moodle.org/405/en/grade/edit/tree/grade · https://docs.moodle.org/500/en/Grade_history |
| **Gibbon** | Ficha única do estudante ligada a horário, avaliações, presença, necessidades educativas e família; candidaturas -> aprovação -> matrícula; **rollover** guiado entre anos, com backup, opções e resultado das operações; finanças com facturas, recibos, lembretes e pendentes | https://docs.gibbonedu.org/tutorials/using-gibbon/general/student-profile · https://docs.gibbonedu.org/guides/modules/admissions/admissions · https://docs.gibbonedu.org/guides/modules/user-admin/rollover · https://gibbonedu.org/features/ |
| **openSIS** | Conta corrente do aluno com cobranças, pagamentos, saldo, depósitos, anulações e histórico; pagamento de uma ou várias facturas e pagamentos parciais; relatórios de movimentações de turmas (add/drop), filtros por data e exportação; portais distintos aluno/encarregado | https://help.opensis.com/portal/en/kb/articles/billing-and-subscription-terms · https://help.opensis.com/portal/en/kb/articles/record-a-student-fee-payment · https://help.opensis.com/portal/en/kb/articles/generate-add-drop-reports · https://help.opensis.com/portal/en/kb/articles/portals |
| **Fedena** | Propinas por curso/categoria; calendários de cobrança; descontos; recibos personalizados e adiantamentos; relatórios de cobranças e avisos de atraso | https://fedena.com/feature-tour/school-fees-management-system |
| **OpenEMIS Core / School** | Gestão de estudantes, pessoal, escolas, avaliações e presenças, com perspectiva escola, município/província/sector e capacidade de integração de dados. Regras explícitas de classes, disciplinas, permissões e ligações estudante–instituição | https://www.openemis.org/products · https://support.openemis.org/core/en/rules-institution-students/ |
| **DHIS2 SEMIS (Educação)** | Gestão aberta de alunos, pessoal e escolas, assiduidade web/mobile offline, progressão, retenção, transferência e conclusão, particularmente pertinente para infraestruturas públicas | https://dhis2.org/education/ |

## 2. Padrão transversal que o SIGA deve adoptar

**Identidade permanente, contexto anual separado.** A entidade `Pessoa/Aluno` permanece; a **matrícula** tem escola, ano, nível, turma, estado e datas próprias; inscrições anteriores continuam consultáveis. Uma mudança de turma não apaga notas, histórico ou relações familiares. Na troca do ano lectivo, nunca «devolver todos os alunos a Pessoas» destruindo relações: declarar o ciclo actual fechado e gerar proposta de novas matrículas.

**Turma é uma unidade de trabalho, não só uma linha da tabela.** Abrir uma turma mostra identificação, vagas (disponíveis/ocupadas/reservadas), alunos (activos/previstos/saídos), horário, disciplinas, professores, avaliação, presenças, comunicação e histórico de mudanças. A navegação secundária deve ser contextual à turma; não abrir dezenas de modais sem estado.

**Perfil do aluno é uma ficha institucional interligada.** Cabeçalho com ID/BI e escola/ano, estado e acções permitidas. Secções: Identificação; Matrículas e histórico; Encarregados; Notas e pautas; Presenças; Financeiro; Documentos; Transportes; Intervenções. Informação sensível só aparece conforme autorização, não pela simples pertença à escola.

**Gestão em lote com semântica honesta.** Seleccionar nesta página != seleccionar todos os resultados filtrados. Antes de executar, pré-visualização com destino, contagem, excluídos, conflitos e permissões; confirmar explicitamente. Depois: `N concluídos / N falharam / N ignorados`, nome/ID e motivo por aluno, mantendo apenas os falhados para repetição. Se o backend não for transaccional, nunca prometer «tudo ou nada». Relatório add/drop com quem alterou, turma de origem/destino e data efectiva.

**Pautas e notas têm ciclo de vida.** Rascunho editável -> submetida -> homologada/publicada -> rectificação por pedido/autorização. Notas anteriores preservadas. Na grelha: validação de 0 a 20 e cotação específica, `null` diferente de 0, gravar apenas alterações, verificar concorrência, histórico por nota e indicativo de override. Professor visualiza apenas atribuições autorizadas. Nem um erro silencioso nem uma mensagem de «tudo salvo» após êxito parcial.

**Financeiro é conta corrente auditável, não lista de recibos.** Por aluno: facturado, pago, saldo em aberto, valor vencido, descontos/bolsas, multas, estornos, movimentos, reconciliação. Para contabilista: filtros por escola, ano, curso, nível, turma, faixa de atraso (0–30, 31–60, 61–90, 90+), estado e tipo; selecção em massa para lembrete/cobrança ou geração autorizada, mas **não criar pagamentos fictícios**. Exportar universo filtrado com total, data e permissão, sem confundir «página visível» com relatório integral. Distinguir documentos internos de documentos fiscais certificados.

**Horários centrados em conflitos reais.** Grelha por turma/professor/sala e turno; verificar sobreposições e capacidade antes de publicar; horários publicados têm versão, e alterações notificam os afectados. Views mobile focadas no dia e próxima aula.

**Administração pública e conectividade.** O SIGA deve trabalhar com moeda Kz, identificação BI/cédula/ID por escola, calendário e turnos locais parametrizáveis, serviços públicos com cobranças desactivadas ou configuradas conforme a escola, downloads PDF/Excel e fluxos tolerantes a rede intermitente. Nenhuma norma angolana específica deve ser presumida sem verificação legal própria.

## 3. Desenho concreto dos ecrãs e operações

### Início da escola
Cabeçalho: escola activa, ano lectivo, turno, pesquisa global, identidade do utilizador. Área principal com **acções de hoje** ajustadas ao papel, 4-6 indicadores úteis e riscos prioritários; listas curtas de presenças por lançar, notas por corrigir, turmas sem professor, documentos em falta, cobranças vencidas quando aplicável. Sem gráficos vazios nem botões decorativos.

### Pessoas / Alunos
Tabela com ID, nome, nível, turma actual, estado, contacto autorizado, última alteração e menu de acções. Pesquisa/filtros/paginação no servidor, com contagem e escopo por escola. Acções principais: **Procurar aluno existente** e **Criar novo** como alternativas no mesmo fluxo `Matricular`. Se a pessoa já existe, reutilizar ID e histórico. Em operações em lote: contagem exacta de seleccionados, pré-visualização e relatório individual.

### Turma — página própria
Título «7.ª classe · Turma A · Manhã», indicador de lotação e professor/tutor; tabs contextuais: Visão geral, Alunos, Disciplinas, Horário, Presenças, Avaliações, Documentos, Histórico. Botão principal `Adicionar/Matricular aluno`; subfunções de importar, mover, remover da turma, imprimir lista sob menu, cada qual com permissão e confirmação correspondente. Painel direito pode mostrar trabalho pendente do professor, próxima aula e últimas alterações, sem roubar a área principal.

### Avaliação / grelha de notas
Colunas: ID, nome, cada avaliação, notas em falta, média calculada e estado. Cabeçalho com disciplina/turma/trimestre, cotação e status de pauta. Acção `Guardar alterações` com indicador de linhas modificadas, erros por célula e confirmação de conflito. Dois modos: **Por avaliação** (massa) e **Por aluno** (histórico e feedback). Homologação é outra operação com permissão e confirmação, não um botão ao lado de Guardar.

### Financeiro / Cobrança
Separar `Resumo`, `Cobranças`, `Pagamentos`, `Facturas e recibos`, `Relatórios` e `Configuração`. Na lista de cobrança: filtros por curso, classe, turma, estado, atraso; contador de alunos e total monetário (Kz). Operação em lote gera simulação/preview; confirmação permite `Enviar avisos` ou `Gerar cobranças` quando autorizado; após execução, falhas isoladas, IDs de operação e resultado auditado. Nunca utilizar acção de cobrança em lote como sinónimo de marcar pagamentos recebidos.

### Fecho / início de ano
Assistente com: (1) validação de pautas/pendências, (2) cópia de configuração/horários quando apropriado, (3) proposta de promoção/retenção, (4) distribuição em turmas com capacidade e idade, (5) comparação antes/depois, (6) confirmação autorizada, (7) relatório de execução e possibilidade de recuperação. Histórico do ano anterior imutável salvo rectificação autorizada.

## 4. Priorização para PR #378 — implementar sem remover

**P0 · Integridade antes de visual:** exigir vínculos/tenant no servidor; CAS ou RPC transaccional em gravações de notas, turmas e cobranças; idempotência por operação; histórico; sem falsos sucessos; encriptação/visibilidade de contactos conforme papel; sem desactivar MFA.

**P1 · Fluxos essenciais:** corrigir matrícula novo/existente e transferências; conferir consistência de matrículas activas/pendentes e mudanças; filtros paginados reais e exportação total segura; pauta com rascunho/submissão/homologação e gestão de conflitos; painel de cobranças segmentadas.

**P2 · Organização e UI:** páginas de detalhe completas de Turma, Aluno, Disciplina e Professor; barra lateral contextual persistente; centro de trabalho do docente; tarefas/alertas ajustados ao papel; modais mínimos, acessibilidade e navegação por teclado.

**P3 · Eficiência e interoperação:** relatórios com filtros/versões, histórico exportável, calendário/Google, funcionalidades offline seguras, integrações Payflow/WhatsApp com retentativas, auditoria e separação de tenants.

## 5. Matriz mínima de testes de aceitação

| Fluxo | Evidência exigida |
| --- | --- |
| Matricular pessoa existente ou nova | Não duplica identidade; mantém ID; último lugar concorrente respeita a capacidade na base; estados completos |
| Mover 30 alunos | Pré-visualização; só matrículas elegíveis; falhas por aluno; histórico origem/destino; reenvio só dos falhados |
| Mudar escola durante pesquisa | Nenhum dado ou contacto da escola anterior reaparece no cache, exportação ou UI |
| Gravar pauta | Valores 0–20, nulos, cotação da avaliação, sobreposição concorrente, auditoria por nota, período/pauta fechados |
| Cobrar alunos com dívida | Filtrar por curso/nível/turma/atraso; somas reconciliadas; nenhum pagamento inventado; isolamento por escola |
| Encerrar ano lectivo | Rascunho/simulação e validações; promoção e retenção sem perder notas históricas; resultado verificável |
| Rede indisponível | Erro claro, nenhuma duplicação ao tentar novamente, estados de sincronização e reconciliação |
| Segurança | Dois tenants + dois papéis + AAL2 real; tentativas de contorno da UI negadas no servidor |
| Qualidade | CI, TypeScript, Vitest, SQL/PGlite, Playwright com sessão autenticada e revisão visual mobile/desktop |

## 6. Proibição de falsas equivalências

Esta pesquisa não significa que o SIGA já tenha implementado estas práticas. O código deve ser confrontado com a versão actual de `main` e as PRs paralelas. Os padrões acima são decisões propostas; não copiar layouts, imagens, marcas, textos ou código proprietário. Sistemas Open Source só podem ser reutilizados dentro das respectivas licenças, com auditoria técnica e desempenho.

**Estado de execução:** documento de pesquisa e especificação; não aplica SQL, não altera produção, não faz merge nem deploy.
