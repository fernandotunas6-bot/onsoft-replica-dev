# Jornada anual e gates de publicação

08/10/2026. **Estado:** bloqueada para escrita integrada por ausência de staging confirmado. Não executar no projecto de produção, ainda que o browser/servidor seja localhost. Dados sintéticos identificados, destinatários de teste e pagamentos sandbox.

| Etapa | Pré-condição | Aceitação UI → API → persistência |
| --- | --- | --- |
| 1. Escola e administrador A/B | Staging, contas e guard E2E | Tenant/escola/vínculo/domínio coerentes, reenvio sem duplicação |
| 2. Ano, períodos e regras | Etapa 1, Administrador AAL2 | Um ano activo, datas/regras guardadas e período dependente orientado |
| 3. Classes, disciplinas, salas e turmas | Etapa 2 | Relações da escola/ano, capacidade configurada |
| 4. Professores e funcionários | Etapa 1 e papéis | Pessoa/conta/atribuições/RH coerentes |
| 5. Aluno manual | Etapas 2–3, Secretaria AAL2 | Atomicidade/reenvio, processo EST/MAT e histórico |
| 6. Lote de 200 alunos | Schema/modelo e staging | Contagens gravadas/rejeitadas/pendentes reconciliadas; reimportação segura |
| 7. Matrícula e distribuição | Alunos e vagas | Matrícula única por ano; concorrência de última vaga e turma B recusada |
| 8. Obrigações financeiras | Matrícula e regra institucional | Contrato/propina/factura prevista vinculada uma vez |
| 9. Pagamento/documento de teste | Sandbox e obrigação | Backend confirmado; recibo/saldo/portal, reenvio/estorno coerentes |
| 10. Horários e eventos | Turmas, docentes e calendário | Conflitos recusados; publicação/portais/impressão coerentes |
| 11. Presenças e avaliações | Horário e conta professor | Âmbito docente, sessões/instrumentos guardados, QR/replay |
| 12. Notas/médias | Regras vigentes e avaliação | Comparação independente, zero/ausente/dispensa distintos |
| 13. Boletim/pauta | Notas/modelos/assinantes | Totais/decisão/identidade institucional e layout longo correctos |
| 14. Portais por perfil | Dados e contas por papel | Cada perfil conclui tarefas e vê apenas âmbito autorizado |
| 15. Fecho de período | Autoridade/regras e avaliações | Lançamento/correcção bloqueados; reabertura auditada |
| 16. Renovação/transição | Decisão académica e próximo ano | Histórico preservado, sem duplicação nem decisões inventadas |
| 17. Isolamento B | Duas escolas/contas | IDOR/UI/API/DB/arquivos/exportação/cache/cron/notificações recusados |

Casos alternativos em cada etapa: obrigatório inválido, duplicado, AAL1/sem grant, sessão expirada, rede desligada, resposta perdida, duplo clique, conflito de utilizadores e falha intermédia. Registar estado anterior/posterior e efeitos dependentes. Métricas com condições/volume, sem inferir capacidade de utilizadores a partir de um health 200.

## Gate de revisão e reversão

Tipos, lint, testes relevantes, SQL idempotente/local, módulos e build. Antes de publicar: staging da mesma versão, catálogo após SQL, critérios críticos aprovados, SHA rastreável e plano de reversão revisto. Regressões locais são necessárias, mas insuficientes para certificar todo o ano.

SQL preparado e código dependente devem ser promovidos na ordem do documento de revisão; não publicar o código novo contra RPCs ausentes. Reversão preserva os registos concluídos e a auditoria; não apagar alunos/facturas para voltar uma versão.

[Índice](README.md) · [Revisão SQL](../implementation/2026-10-07/REVISAO_SQL.md)
