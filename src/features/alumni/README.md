# SIGA Alumni Premium

Módulo aditivo para transformar a relação com antigos alunos numa continuidade do ciclo académico do SIGA.

## Princípios

1. **Não duplicar Pessoas** — `person_id` liga o alumni à identidade canónica já existente.
2. **Multi-tenant obrigatório** — todas as entidades operacionais carregam `school_id`.
3. **Financeiro continua no Finance/PayFlow** — Alumni guarda engagement/contribuição; liquidação e reconciliação pertencem ao domínio financeiro.
4. **Privacidade por desenho** — perfil tem visibilidade explícita e RLS começa deny-by-default.
5. **Migração progressiva** — concluir aluno não deve apagar matrícula/histórico; deve poder originar perfil Alumni idempotentemente.
6. **Sem regressão** — nenhuma rota, tabela ou função existente é removida.

## Domínios v1

- Diretório e perfil Alumni verificado
- Coortes por curso/turma/ano de conclusão
- Eventos, reencontros e inscrições
- Carreiras: emprego, estágio, bolsa, negócio e voluntariado
- Mentoria e matching
- Contribuições e impacto
- Analytics Alumni

## Integrações planejadas

- Pessoas: identidade, contactos e consentimentos
- Académico/Matrículas: conclusão, curso, turma, ano e histórico
- Documentos: certificados/declarações já existentes
- Comunicações: campanhas segmentadas
- Calendário: eventos Alumni
- Finance/PayFlow: doações/patrocínios pagos e reconciliação
- Inteligência: insights agregados sem exposição indevida de dados pessoais

## Gates antes de produção

- [ ] Confirmar FK canónica de `person_id` no schema atual e adicioná-la sem quebrar dados legados.
- [ ] Reutilizar helpers/policies tenant/RBAC existentes e criar policies por papel.
- [ ] Implementar consentimento e preferências de comunicação.
- [ ] Criar serviço idempotente `graduate -> alumni`.
- [ ] Criar UI `/alumni` com estados loading/empty/error e responsividade.
- [ ] Integrar calendário, comunicações e PayFlow por contratos explícitos.
- [ ] Testar isolamento entre duas escolas e acesso do próprio alumni.
- [ ] Testar migração, rollback lógico, auditoria e exportação LGPD-like/privacy.
- [ ] Executar lint, typecheck, testes unitários/integrados e build antes de merge.

## KPIs premium

Total Alumni, verificados, taxa de perfis completos, alumni ativos 30/90 dias, participação em eventos, oportunidades publicadas/preenchidas, mentorias ativas/concluídas, distribuição geográfica, evolução profissional e impacto/contribuições.
