# Ensino Superior em Angola — requisitos e cobertura no SIGA

Pesquisa de 2026-10-03. Os sites angolanos (lex.ao, angolex.com, sites das IES) estão
bloqueados a partir do ambiente de desenvolvimento: as regras abaixo vêm dos resumos
públicos dos diplomas e de regulamentos institucionais. Confirmar no texto oficial antes
de tratar como definitivo.

## Quadro legal

| Diploma                            | Assunto                                                                                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lei 17/16, alterada pela Lei 32/20 | Lei de Bases: graduação (bacharelato, licenciatura) e pós-graduação (mestrado, doutoramento); sistema binário universitário/politécnico                                                                                                                           |
| Decreto Presidencial 193/18        | Normas curriculares gerais da graduação: unidade de crédito em horas de trabalho do estudante; **1 a 20 créditos por unidade curricular**; UC obrigatórias, opcionais e transversais, semestrais                                                                  |
| Decreto Presidencial 5/19          | Acesso: exame de acesso definido pela IES, vagas propostas anualmente, regime especial                                                                                                                                                                            |
| Decreto Presidencial 59/20         | Modalidades a distância e semipresencial (avaliações presenciais, tecnologias, parcerias)                                                                                                                                                                         |
| Decreto Presidencial 203/18        | Avaliação e acreditação da qualidade das IES                                                                                                                                                                                                                      |
| Decreto Presidencial 257/25        | Graus e títulos: licenciado, mestre, doutor; **classificação final = média ponderada, inteiro 10–20**, pode ter menção; sem defesa pública obrigatória na licenciatura e no mestrado; doutoramento com defesa e Aprovado / com distinção / com distinção e louvor |
| SISIES (MESCTI, desde 1/10/2025)   | Plataforma do Ministério; o GEPE recolhe anualmente 7 bases: Vagas, Acesso, Matrículas, Graduados, Pós-graduados, Bolsas, Recursos Humanos (Excel)                                                                                                                |

Menções usadas (mestrado; aplicadas pelo SIGA a todos os graus de 10–20):
10–13 Suficiente · 14–15 Bom · 16–17 Bom com distinção · 18–19 Muito Bom · 20 Excelente.

Regulamentos institucionais típicos: épocas normal, recurso e especial (e exame
extraordinário, de equivalência, de melhoria); perda de frequência com ~30 % de faltas
injustificadas às aulas dadas no semestre.

## Cobertura no SIGA

| Requisito                                                                                         | Estado                                                                              |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Cursos de licenciatura e pós-graduação, anos curriculares                                         | ✅                                                                                  |
| Plano curricular por semestre com créditos (1–20 por UC) e precedências                           | ✅                                                                                  |
| Regulamento configurável (créditos/ano e semestre, pesos, admissão, dispensa, faltas, tentativas) | ✅                                                                                  |
| Épocas normal, recurso, especial, melhoria                                                        | ✅                                                                                  |
| Exame extraordinário e de equivalência                                                            | ➖ equivalência coberta por «Creditar»; extraordinário não                          |
| Ano lectivo por semestres                                                                         | ✅ (gravação um a um; gravação conjunta exige migração)                             |
| Inscrição por cadeira (individual e em lote), anulação                                            | ✅                                                                                  |
| Pautas por cadeira, lançamento pelo docente, impressão                                            | ✅                                                                                  |
| Histórico académico, certificado de conclusão                                                     | ✅ certificado com n.º de registo (série CE) e QR para /verificar                   |
| Classificação final inteira 10–20 com menção (257/25)                                             | ✅                                                                                  |
| Emolumentos (recurso, especial, melhoria, certidão)                                               | ✅                                                                                  |
| Candidatura com curso pretendido                                                                  | ✅                                                                                  |
| Doutoramento: decisão do júri (Aprovado / com distinção / com distinção e louvor)                 | ✅ com acta, 2FA e auditoria                                                        |
| Modalidade (presencial/semipresencial/distância) e regime (regular/pós-laboral) por curso         | ✅                                                                                  |
| Vagas por curso e exame de acesso (nota, seriação)                                                | ✅ separador «Acesso»                                                               |
| Estatuto trabalhador-estudante (faltas, época especial)                                           | ✅ com prova, datas e 2FA                                                           |
| Exportação para o SISIES/GEPE (Vagas, Acesso, Matrículas, Graduados)                              | ✅ Excel                                                                            |
| Diploma / carta de curso registado com QR                                                         | ✅ certificado de conclusão emitido com 2FA, uma vez por curso                      |
| Bolsas                                                                                            | ❌                                                                                  |
| Grau do curso: bacharelato, licenciatura, mestrado, doutoramento, especialização                  | ✅ (o bacharelato, como a licenciatura, fica `undergraduate` na base: sem migração) |

## Pendente (precisa de migração ou de decisão)

- Bolsas, turnos/vagas por turma com lista de espera.

## Comparação com outros sistemas académicos

| Lógica                                                     | Onde existe                                                | No SIGA                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Plano curricular com créditos e precedências               | Banner (prerequisites), FenixEdu (curricular plans), SIGAA | ✅                                                                                                                        |
| Inscrição online em cadeiras por período                   | SIGAA (matrícula on-line), FenixEdu                        | ✅ secretaria (individual e em lote) e estudante no portal (regra do regulamento, desligada por omissão)                  |
| Trancamento/anulação de cadeira com prazo                  | SIGAA (até 6 semanas)                                      | ✅ anulação com motivo; prazo no regulamento, depois exige 2FA                                                            |
| Aproveitamento de estudos / equivalência                   | SIGAA, SIGARRA                                             | ✅ «Creditar» com 2FA                                                                                                     |
| Degree audit: o que falta para concluir                    | Banner (degree audit)                                      | ✅ «Para concluir: N cadeiras, X créditos»                                                                                |
| Situação académica (regular / atraso / risco)              | Banner (academic standing: good standing, probation)       | ✅ configurável no regulamento                                                                                            |
| Prescrição / prazo máximo de integralização                | SIGARRA (prescrição), SIGAA (prazo de conclusão)           | ✅ «anos além da duração» (0 = desligado)                                                                                 |
| Fluxo de correcção de notas                                | Banner (grade change workflow)                             | ✅ «Corrigir nota»: secretaria, 2FA, motivo, auditoria                                                                    |
| Holds: dívida bloqueia inscrição/documentos                | Banner (registration holds)                                | ✅ inscrição e certificado de conclusão: duas opções do regulamento (desligadas por omissão); as declarações gerais — não |
| Estatuto trabalhador-estudante (faltas, prescrição a 50 %) | SIGARRA                                                    | ✅ faltas, época especial e prescrição (regulamento)                                                                      |
| Turnos/vagas por turma e lista de espera                   | FenixEdu (turnos), Banner (capacity, waitlist)             | ❌                                                                                                                        |
| Calendário de inscrições e épocas                          | FenixEdu (curricular calendars), SIGAA                     | ✅ datas de abertura e fecho no regulamento; janelas por época — não                                                      |
| Sistemas angolanos (SIGU, SkyGnova, SIGA.ao)               | candidatura → certificado num só sistema                   | ✅ mesmo ciclo                                                                                                            |

Fontes: [SIGAA — trancamento](https://sigaa.ufrn.br/sigaa/public/curso/secao_extra.jsf?lc=en_US&id=111635057&extra=1677436146),
[SIGAA — matrícula on-line](https://docs.info.ufrn.br/doku.php?id=suporte%3Amanuais%3Asigaa%3Aportal_do_discente%3Aensino%3Amatricula_on_line%3Arealizar_matricula),
[SIGARRA — trabalhador-estudante](https://sigarra.up.pt/up/pt/legislacao_geral.legislacao_ver_ficheiro?pct_gdoc_id=789515&pct_nr_id=16273&pct_codigo=1),
[FenixEdu Academic](https://confluence.fenixedu.org/display/ACADEMIC/Getting+Started),
[Banner Student User Guide](https://banner.jcu.edu/ellucian/user/Banner_Student_8.14_and_9.3.7_User_Guide.pdf),
[Expansão — sistemas nacionais](https://expansao.co.ao/universidade/detalhe/universidades-preferem-sistemas-de-gestao-academica-nacionais-65228.html).
