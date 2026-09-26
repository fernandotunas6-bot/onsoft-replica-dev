
## Diretiva de execução autónoma (SIGA Plus)
- Executar tarefas até conclusão: analisar, implementar, testar, corrigir, validar — sem pedir confirmação.
- Melhorar sem remover; preservar RLS, permissões, rotas e identidade visual.
- Verificação final obrigatória: tipos, testes, build, rotas, loading/empty/error states.

## Volta 2026-09-25
- [x] Diagnóstico de erros com IA (admin) — /configuracoes/diagnostico
- [x] Sessão expirada → ecrã de entrada com aviso (sem ecrã em branco)
- [x] Testes Decreto 424/25 (limites) — tests/academic/decreto-424-25.test.ts
- [x] Optimização: notas paginadas (médias das turmas) + consultas em paralelo no espaço pedagógico
- [x] Alunos em risco com IA (professores) — /pedagogica/risco
- [x] Exportar pautas CSV/PDF com turma, período e disciplinas (Relatórios Académicos)

## Volta 2026-09-25 (2) — ordem pedida
- [x] 1. Auditoria académica: períodos, salas, horários, turmas, disciplinas, níveis, cursos/classes
- [x] 2. Tesouraria: fluxo de caixa, facturas pendentes, relatórios (só Tesouraria)
- [x] 3. Alunos em risco: acompanhamento com histórico de intervenções e progresso
- [ ] 4. Pagamentos AppyPay: webhook real + conciliação facturas/transacções/contas (outros gateways no futuro) — código pronto; falta: chaves AppyPay da escola

- [ ] 5. Publicar e ligar app.portal-siga.com (Cloudflare) — sessões e IA sem localhost

## Volta 2026-09-25 (3) — Google Workspace por utilizador + construtor inteligente de horários
- [ ] 1. Base de dados: turnos/blocos, versões de horário com modelo por período, disponibilidade docente, RPCs atómicos (Lovable Cloud + SQL para o SGA)
- [ ] 2. Motor de sugestão de horários (determinístico, testado): cargas semanais, conflitos de professor/sala/turma, distribuição, continuidade com o período anterior
- [ ] 3. Construtor de horários (/horarios): grelha editável, sugestões, guardar modelo do período, sugerir para o período seguinte com pequenas alterações, IA para afinar
- [ ] 4. Ligações Google por utilizador (Gmail, Calendar, Drive, Sheets) + Excel: página /workspace, ligação por utilizador via gateway, painéis rápidos, horário → Google Calendar
- [ ] 5. Google Maps na escola (morada, mapa) — depende de ligar o conector Google Maps
- [ ] 6. Pedir ao utilizador os clientes OAuth (cartões de ligação) e testar ao vivo
