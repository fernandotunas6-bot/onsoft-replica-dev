# SIGA Plus — PR #132: matriz de homologação e autorização de release

Estado em 19/10/2026: **pré-publicação / sem autorização para aplicar SQL**.
PR: https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/132
Ramo: `ccr-6a21e4bf-flutter-ui`. Comparação com `main` na auditoria: **172 commits e 241 ficheiros**.
Estas notas são um handoff operacional, **não** uma ordem de deploy.

## 1. Evidência verificável, limitada ao SHA ensaiado

- CI #2674 no commit `f9a44d986304e580ad9f70231c5147ae89baee7b`: aprovado (lint, TypeScript, Vitest, migrações PGlite e build).
- Vitest desse SHA: **3.818 aprovados / 19 ignorados**; 539 ficheiros de teste aprovados, 3 ignorados.
- PGlite: executou ambas as migrações **duas vezes**, validou **8 FKs compostas** e alterações de linhas pai; também confirma os pacotes SQL de aplicação manual.
- Academic Import #1493: aprovado no mesmo SHA.
- Flutter #103: backend e Flutter/Flutter Web aprovados no mesmo SHA; **não inferir que o APK Android institucional foi concluído** sem conclusão positiva do job Android.
- Smoke E2E de ecossistema, Lighthouse e avisos E2E: **ignorados no CI desta PR** (não são testes verdes).
- As tabelas `siga_task_submissions`, `siga_transport_routes`, `siga_transport_assignments` e `siga_transport_day_status` **não existiam no Sga** na última consulta só de leitura. Bucket `siga-files` privado.
- Há duas migrações **não aplicadas**: `supabase/migrations/20261017140000_task_submissions.sql` e `20261018120000_school_transport.sql`.

Toda alteração posterior ao SHA indicado exige novo CI; não reutilizar este selo de aprovação.

## 2. Gate zero: ambiente seguro

1. Criar/restaurar **staging isolado** com dados fictícios ou cópia sanitizada, sem contactos verdadeiros de menores; identificar ambiente e commit de código explicitamente.
2. Usar contas fictícias de **duas escolas** (A e B) e perfis aluno A, aluno B, professor A, professor B, secretaria A e administrador A; não usar chave service-role no browser.
3. Fazer backup/snapshot e documentar o ponto de reversão; obter autorização explícita antes de aplicar SQL **só em staging**.
4. Conferir `schools`, `students`, `siga_class_tasks`, `private.audit_row_change()`, `public.siga_touch_updated_at()` e os grants existentes.
5. Aplicar nesta ordem no staging: `20261017140000_task_submissions.sql` e `20261018120000_school_transport.sql`. Não copiar e executar estes scripts no projecto Sga de produção.
6. Confirmar idempotência: 2.ª execução deve ser segura; consultar `docs/agents/SIGA_confirmar_migracoes.sql` e confirmar manualmente todas as restrições, índices, RLS e grants.

## 3. Matriz obrigatória de homologação

| Código | Fluxo | Resultado exigido |
| --- | --- | --- |
| AUTH-01 | Aluno A tenta trocar `schoolId` por escola B, ou solicitar os trabalhos da turma B | 403/404, sem dados da escola B |
| AUTH-02 | Professor A pede PDF da tarefa B, ou PDF de aluno fora das suas disciplinas | 403/404, nunca recebe URL assinado |
| AUTH-03 | Utilizador inactivo, sem matrícula ou sessão expirada tenta ler/escrever | Sem acesso; falha fechada |
| PDF-01 | Aluno A carrega PDF válido `<= 10 MiB` e conclui a entrega | Versão 1, apenas um registo (tarefa, aluno) |
| PDF-02 | Repetir `submission` com o mesmo caminho da própria tarefa | Resposta idempotente, sem versão extra e sem `remove()` |
| PDF-03 | Reutilizar caminho noutra tarefa ou para outro aluno | 409; nenhum PDF activo eliminado |
| PDF-04 | Reenviar ficheiro novo com dois pedidos simultâneos | Uma versão vence; o perdedor recebe 409; ficheiro vencedor permanece |
| PDF-05 | PDF vazio, falso PDF, `> 10 MiB`, URL expirado, ficheiro ausente | Rejeição correcta; sem linha parcial; limpeza auditável |
| PDF-06 | Aluno A / professor A abrem o PDF autorizado; aluno B e professor B tentam o mesmo `submissionId` | URL privado de curta duração apenas para quem tem permissão |
| SQL-01 | Inserir tarefa, aluno, rota, paragem e viatura de outra escola via serviço e SQL de staging | 8 FKs compostas/gatilhos recusam referências cruzadas |
| SQL-02 | Mudar `school_id` de aluno/tarefa/rota/viatura depois de ter filhos | PostgreSQL recusa a alteração incoerente |
| SQL-03 | Anon ou authenticated acessam directamente as 6 tabelas sensíveis | Sem SELECT/INSERT/UPDATE/DELETE; RLS e FORCE RLS activados |
| TRANS-01 | Secretaria A cria viatura, rota, paragens e atribui aluno A | Aparece só na escola A |
| TRANS-02 | Secretaria A tenta usar aluno B, paragem de rota B ou veículo B | Rejeição; nenhuma referência cruzada |
| TRANS-03 | Alterar ordem das paragens, provocar falha de BD a meio, repetir | RPC atómica em staging: rollback integral, sem dados parcialmente reordenados; recusa se a função faltar |
| TRANS-04 | Aviso de atraso para rota A com encarregado já activo, futuro e expirado | Só aluno e encarregado válidos na data recebem aviso |
| TRANS-05 | Gravar mesmo estado diário em sequência e com pedidos concorrentes | Sem notificação duplicada; ensaio de concorrência real |
| APP-01 | Flutter: login/MFA, alternar A/B, calendário, trabalhos, transporte e ficheiros | Mesmas regras da API/portal; sem fallback silencioso para demo |
| APP-02 | Android APK institucional, Android sem rede, reconexão, iOS/PWA no dispositivo suportado | Sem dados de outra escola; estados de falha e carregamento legíveis |

**Bloqueadores conhecidos ainda não resolvidos:**
- A PR passou a incluir `siga_transport_save_stops_atomic`: função `SECURITY INVOKER`, acesso `service_role`, lock na rota e rollback numa única transacção. O servidor **não** utiliza a lógica antiga como fallback. **Ainda falta ensaio em staging PostgreSQL real** (PGlite isolado não testa pedidos concorrentes reais nem comprova autorização de publicação).
- `setTransportDayStatus` faz leitura, upsert e envio de avisos em chamadas separadas; testar concorrência e evitar avisos duplicados antes de produção.
- Não há prova de ponta a ponta com autenticação real no CI da PR. Não usar a suite PGlite como substituto desse ensaio.

## 4. Plano de aprovação e reversão

1. CI de **HEAD actual** completamente verde, incluindo Flutter/Android ou decisão explícita de não lançar Android nesta release.
2. Testes anteriores executados e documentados em staging, com autor, data, evidências e resultado por caso.
3. Recolher contagem de linhas e FKs antes/depois, avaliar índices e latência em staging; nenhum dado pessoal real em screenshots/logs.
4. Aprovação separada de **migrações Supabase**, **merge** e **deploy**. A `main` aciona pipeline de produção também para PayFlow/D1; não fazer merge só por CI verde.
5. Antes de publicar, resolver o bloqueio do token Cloudflare e o procedimento da issue #181 e a PR #182 (lint), ambos separados desta PR.
6. Reversão: manter backup/restore point de BD, confirmar compatibilidade código-esquema e que não há entregas/atribuições reais antes de qualquer rollback que implique DROP. Preferir desactivar rotas de escrita e voltar à versão anterior do código; rollback de esquema só após análise dos dados.
7. Após publicação aprovada, executar apenas smoke tests autorizados por escola e vigiar 403/409/5xx, Storage, notificações e logs de auditoria, sem expor dados de menores.

**Estado deste documento:** define o gate; não comprova homologação efectuada. Enquanto faltar qualquer bloqueador, manter PR #132 em draft e ambiente produtivo inalterado.
