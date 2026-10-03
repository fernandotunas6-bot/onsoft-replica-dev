# Ensino Superior em Angola — requisitos e cobertura no SIGA

Pesquisa de 2026-10-03. Os sites angolanos (lex.ao, angolex.com, sites das IES) estão
bloqueados a partir do ambiente de desenvolvimento: as regras abaixo vêm dos resumos
públicos dos diplomas e de regulamentos institucionais. Confirmar no texto oficial antes
de tratar como definitivo.

## Quadro legal

| Diploma | Assunto |
| --- | --- |
| Lei 17/16, alterada pela Lei 32/20 | Lei de Bases: graduação (bacharelato, licenciatura) e pós-graduação (mestrado, doutoramento); sistema binário universitário/politécnico |
| Decreto Presidencial 193/18 | Normas curriculares gerais da graduação: unidade de crédito em horas de trabalho do estudante; **1 a 20 créditos por unidade curricular**; UC obrigatórias, opcionais e transversais, semestrais |
| Decreto Presidencial 5/19 | Acesso: exame de acesso definido pela IES, vagas propostas anualmente, regime especial |
| Decreto Presidencial 59/20 | Modalidades a distância e semipresencial (avaliações presenciais, tecnologias, parcerias) |
| Decreto Presidencial 203/18 | Avaliação e acreditação da qualidade das IES |
| Decreto Presidencial 257/25 | Graus e títulos: licenciado, mestre, doutor; **classificação final = média ponderada, inteiro 10–20**, pode ter menção; sem defesa pública obrigatória na licenciatura e no mestrado; doutoramento com defesa e Aprovado / com distinção / com distinção e louvor |
| SISIES (MESCTI, desde 1/10/2025) | Plataforma do Ministério; o GEPE recolhe anualmente 7 bases: Vagas, Acesso, Matrículas, Graduados, Pós-graduados, Bolsas, Recursos Humanos (Excel) |

Menções usadas (mestrado; aplicadas pelo SIGA a todos os graus de 10–20):
10–13 Suficiente · 14–15 Bom · 16–17 Bom com distinção · 18–19 Muito Bom · 20 Excelente.

Regulamentos institucionais típicos: épocas normal, recurso e especial (e exame
extraordinário, de equivalência, de melhoria); perda de frequência com ~30 % de faltas
injustificadas às aulas dadas no semestre.

## Cobertura no SIGA

| Requisito | Estado |
| --- | --- |
| Cursos de licenciatura e pós-graduação, anos curriculares | ✅ |
| Plano curricular por semestre com créditos (1–20 por UC) e precedências | ✅ |
| Regulamento configurável (créditos/ano e semestre, pesos, admissão, dispensa, faltas, tentativas) | ✅ |
| Épocas normal, recurso, especial, melhoria | ✅ |
| Exame extraordinário e de equivalência | ➖ equivalência coberta por «Creditar»; extraordinário não |
| Ano lectivo por semestres | ✅ (gravação um a um; gravação conjunta exige migração) |
| Inscrição por cadeira (individual e em lote), anulação | ✅ |
| Pautas por cadeira, lançamento pelo docente, impressão | ✅ |
| Histórico académico, certificado de conclusão | ✅ (sem registo/QR de verificação) |
| Classificação final inteira 10–20 com menção (257/25) | ✅ |
| Emolumentos (recurso, especial, melhoria, certidão) | ✅ |
| Candidatura com curso pretendido | ✅ |
| Distinção mestrado / doutoramento; bacharelato | ❌ só «licenciatura» e «pós-graduação» |
| Doutoramento: tese, júri, Aprovado/distinção/louvor | ❌ |
| Modalidade (presencial/semipresencial/distância) e regime (regular/pós-laboral) por curso | ❌ |
| Vagas por curso e exame de acesso (nota, seriação) | ❌ |
| Estatuto trabalhador-estudante (faltas, época especial) | ❌ |
| Exportação para o SISIES/GEPE (Matrículas, Graduados, Vagas, Acesso) | ❌ |
| Diploma / carta de curso registado com QR | ❌ |
| Bolsas | ❌ |

## Próximos passos sugeridos (sem migração)

1. Modalidade e regime por curso (domínio `higher_ed`).
2. Exportação SISIES/GEPE: Matrículas e Graduados por curso, em Excel.
3. Vagas por curso e nota do exame de acesso na candidatura, com seriação.
4. Grau de pós-graduação (mestrado / doutoramento / especialização) por curso.
