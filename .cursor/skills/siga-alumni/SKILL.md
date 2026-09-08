# SIGA Alumni — Master Premium Skill

## Missão
Gerir todo o ciclo pós-formação do SIGA sem duplicar identidade, matrícula ou histórico académico. `people`, `students` e `enrollments` permanecem como fonte oficial da verdade escolar; Alumni acrescenta apenas carreira, empregabilidade, networking, mentoria, oportunidades, eventos, tracer studies, contribuição social/financeira, privacidade, comunicação e relacionamento institucional.

## Princípios não negociáveis
- Auditar e reutilizar estruturas existentes antes de criar novas.
- Nunca criar uma segunda Pessoa ou um segundo Aluno para representar o mesmo Alumni.
- Alumni nasce preferencialmente de `students.status = graduated`.
- Todo acesso operacional é multi-tenant por `school_id`.
- Escritas administrativas passam por server functions autenticadas e `requireSgaWriter`.
- Workspace administrativo Alumni é restrito a `Administrador` e `Secretaria`.
- Portal self-service só opera sobre o perfil cujo `auth_user_id` corresponde à sessão e `self_service_enabled = true`.
- RLS permanece activa em todas as tabelas Alumni; não abrir policies públicas genéricas.
- Não apagar nem reescrever histórico académico ao actualizar/arquivar Alumni.
- Contactos pessoais só entram em segmentação/exportação conforme `contact_consent` e preferências de canal/finalidade.
- Alterações de consentimento, visibilidade e claim devem ser auditáveis.
- Analytics devem derivar de dados reais do banco; não fabricar métricas.
- Comunicação Alumni reutiliza o motor central `school_announcements`; não criar um segundo sistema paralelo.
- Registar um comunicado como `sent` não significa que um provider externo entregou e-mail/SMS; entrega depende das integrações configuradas.
- Toda nova rota deve permanecer coerente com `access-policy.ts`, `route-inventory.ts`, `navigation-catalog.ts`, `portal-engine.ts` e `scripts/siga/modules.json`.

## Superfícies oficiais
- `/alumni`: workspace master — directório, carreira, talento, oportunidades, mentoria, eventos e impacto.
- `/alumni/$alumniId`: ficha Alumni 360º — identidade, processo original, percurso, experiências, engagement, mentoria, candidaturas e eventos.
- `/alumni/operations`: Centro Operacional — publicar oportunidades/eventos, construir tracer studies e registar contribuições.
- `/alumni/insights`: Insights & Operações — geografia, empregabilidade, públicos consentidos e exportação protegida.
- `/alumni/communications`: comunicação segmentada Alumni sobre o motor central de Comunicados do SIGA.
- `/alumni/portal`: portal self-service do próprio antigo aluno — carreira, oportunidades, eventos, pesquisas e centro de privacidade.

## Domínio de dados
### Núcleo
- `alumni_profiles`
- `alumni_experiences`
- `alumni_engagements`

### Carreira e oportunidades
- `alumni_opportunities`
- `alumni_opportunity_applications`

### Mentoria
- `alumni_mentorships`

### Eventos
- `alumni_events`
- `alumni_event_registrations`

### Tracer studies
- `alumni_surveys`
- `alumni_survey_responses`

### Impacto
- `alumni_contributions`

### Self-service, privacidade e comunicação
- `alumni_profiles.auth_user_id`
- `alumni_profiles.self_service_enabled`
- `alumni_profiles.self_service_claimed_at`
- `alumni_communication_preferences`
- `alumni_privacy_audit`
- `school_announcements` com segmentos Alumni

## Tracer Studies
O `schema_json` oficial é uma lista de perguntas. Tipos suportados:
- `text`
- `textarea`
- `number`
- `select`
- `multiselect`
- `boolean`
- `date`

Cada pergunta deve ter `id`, `label` e `type`; pode ter `required` e `options`. O renderer self-service também tolera `multi_select` como alias legado, mas novos dados devem usar `multiselect`.

## Privacidade e comunicação
- `directory_visibility`: `private`, `school` ou `alumni`.
- `contact_consent`: autorização geral para contacto institucional.
- Preferências granulares: e-mail, SMS, WhatsApp.
- Finalidades granulares: oportunidades, eventos, mentoria, pesquisas e fundraising.
- Exportação mascara e-mail/telefone quando não existe consentimento.
- Segmentação respeita consentimento + preferência de finalidade + preferência de canal.
- Públicos do motor central: `alumni_all`, `alumni_opportunities`, `alumni_events`, `alumni_mentoring`, `alumni_surveys`, `alumni_fundraising`.
- Antes de criar comunicado, mostrar preview/contagem da audiência elegível.

## Métricas principais
- total de Alumni;
- taxa de empregabilidade;
- empregados e empreendedores;
- Alumni abertos a oportunidades;
- mentores e mentorias activas/concluídas;
- oportunidades publicadas;
- pipeline de candidaturas;
- eventos, inscrições e presenças;
- tracer studies e respostas;
- coortes/anos de conclusão;
- cobertura por província/cidade;
- completude e verificação dos perfis;
- doações/patrocínios/bolsas;
- horas de voluntariado.

## Integrações futuras compatíveis
- providers de e-mail/SMS/WhatsApp do motor central de Comunicações SIGA;
- Documentos/certificados/declarações;
- Calendário SIGA para eventos Alumni;
- PayFlow/Financeiro para campanhas e bolsas quando houver regra financeira aprovada;
- mapa geográfico avançado;
- notificações e automações de tracer study;
- networking/recomendação por coorte, competências, sector e localização.

## Migrações Alumni
1. `supabase/migrations/20260907010000_alumni_master_module.sql`
2. `supabase/migrations/20260907020000_alumni_self_service_portal.sql`
3. `supabase/migrations/20260907030000_alumni_privacy_communications.sql`
4. `supabase/migrations/20260907040000_alumni_self_service_audit.sql`
5. `supabase/migrations/20260907050000_alumni_communications_audiences.sql`

As migrações devem ser verificadas num ambiente Supabase compatível antes de produção. Não assumir que commit no GitHub significa migração aplicada.

## Gate antes de merge/deploy
Executar, quando o runner estiver operacional:
- `npm test`
- `npm run siga:check`
- `npm run build`

Além disso:
- verificar isolamento entre escolas;
- bootstrap de `graduated` deve ser idempotente;
- validar acesso Admin/Secretaria vs portal self-service;
- validar consentimento/exportação;
- testar oportunidade → candidatura;
- testar evento → inscrição/lista de espera;
- testar tracer study dinâmico → resposta;
- testar contribuição → engagement/analytics;
- testar comunicado Alumni → preview consentido → registo em `school_announcements`;
- rever as cinco migrações em ambiente Supabase de teste antes de produção.
