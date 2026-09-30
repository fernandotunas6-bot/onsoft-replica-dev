# Correcções da auditoria de 30/09/2026

Aplicação baseada na main 32a3bdde, preservando as alterações concorrentes. Migrações aplicadas no projecto Supabase xodgfmxiaunpamctfeea, sem criação de pessoas, pagamentos ou salários de teste na produção.

| Problema                          | Resultado verificável                                                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadastro parcial                  | siga_create_person_bundle grava pessoa, documentos, papéis, docente e aluno numa transacção; erro reverte tudo. Numeração de docentes protegida por bloqueio.                                                              |
| Estorno parcial                   | siga_reverse_finance_receipt bloqueia factura e recibo, estorna e recalcula a factura na mesma transacção; rejeita segundo estorno.                                                                                        |
| Escola activa divergente          | Clientes enviam x-siga-school-id. A base valida vínculo activo antes de usar a escola; papel deriva da mesma instituição, sem fallback ao cargo global.                                                                    |
| Escritas privilegiadas sem 2FA    | Guardas de aal2 nas despesas, estornos, planos de pagamento, facturação e cobranças/conciliação manuais. As restrições RLS de dinheiro da main foram preservadas.                                                          |
| Referências e salas fictícias     | Removidas referências EMIS/Unitel geradas por data e salas Zoom/Teams estáticas. URLs Zoom fornecidas pelo provedor são validadas. Integração sem configuração apresenta indicação para configurar.                        |
| Cache em computadores partilhados | HTML de navegação não é persistido; imagens privadas/externas ficam fora do cache; no-store/private respeitado; logout limpa caches SIGA.                                                                                  |
| RPCs legadas inutilizáveis        | EXECUTE retirado a 29 wrappers sem chamadas actuais que falhavam nos helpers privados. Definições preservadas; não receberam privilégios adicionais. Consulta ao catálogo confirmou zero wrappers expostos com esta falha. |
| Esquema divergente                | Inventário recapturado: 183 tabelas públicas, todas com RLS, 333 políticas. Tipos gerados da produção. DDL real das duas tabelas em falta e migrações de RH/facturação já aplicadas capturados no repositório.             |

Validação: typecheck, compilação de produção, suite completa e testes adicionais de privacidade; lint sem erros (avisos preexistentes de fast refresh/any). Testes SQL locais usam PGlite, executam a migração duas vezes e verificam isolamento, 2FA, rollback de cadastro/estorno e sequências. Fixture e limites descritos em tests/sql/README.md. Não substituem ensaios de carga e aceitação numa escola.

## Pendências externas e operacionais

1. **Publicação bloqueada.** Logs do job 110005959080 do run 36749724808 confirmam os cinco segredos ausentes no ambiente GitHub `production`: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY. Configurar em Settings → Environments → production. O conector não permite administrar secrets; não foi feita publicação manual nem repetição de Actions. Credenciais privadas nunca devem entrar no repositório.
2. **Serviços externos.** EMIS/Unitel/Google/Zoom/Teams exigem contas e credenciais dos fornecedores; remover simulações não equivale a activar serviços. Confirmar webhooks, contas e permissões por escola antes da aceitação.
3. **Configuração pedagógica e dados reais.** Ausência de regras de avaliação, folhas salariais ou contas ligadas não justifica inventar dados de produção. Regras oficiais, contratos, turmas e integrações devem ser definidos pelos responsáveis da instituição. Não há certificação legal/AGT/MED demonstrada por testes técnicos.
4. **Supabase Auth.** Advisor mantém aviso de protecção contra passwords comprometidas desactivada; requer configuração administrativa do Auth. Avisos de funções SECURITY DEFINER e RLS sem política precisam de revisão contextual: muitas tabelas são deliberadamente só-servidor. Não foram abertas permissões para silenciar o advisor.
5. **Funcionalidades em PRs anteriores.** PRs de escalas salariais, Google Workspace, matrícula e mobile não foram fundidos sem validação. As correcções desta entrega não certificam esses módulos nem o desempenho em carga.

Referências: https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/36749724808/job/110005959080 ; https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .
