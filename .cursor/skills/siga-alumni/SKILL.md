# SIGA Alumni — Skill

## Objectivo
Gerir o ciclo pós-formação sem duplicar identidade académica. `people`, `students` e `enrollments` continuam como fonte oficial; o domínio Alumni guarda apenas carreira, rede, mentoria, oportunidades, eventos, pesquisas, contribuições e relacionamento institucional.

## Regras obrigatórias
- Todo acesso deve ser multi-tenant por `school_id`.
- Escritas passam por server functions autenticadas e `requireSgaWriter`.
- Não criar nova pessoa/aluno para um Alumni já existente.
- Alumni nasce preferencialmente de `students.status = graduated`.
- Não apagar histórico académico ao arquivar ou desactivar um perfil Alumni.
- Respeitar `directory_visibility` e `contact_consent` em futuras experiências self-service.
- RLS deve permanecer activa nas tabelas Alumni.

## Superfícies
- `/alumni`: workspace master, directório, carreira, mentoria, oportunidades, eventos e impacto.
- `/alumni/$alumniId`: ficha 360º com identidade, percurso, histórico académico, experiências, interações, mentoria, candidaturas e eventos.

## Dados
- `alumni_profiles`
- `alumni_experiences`
- `alumni_engagements`
- `alumni_opportunities`
- `alumni_opportunity_applications`
- `alumni_mentorships`
- `alumni_events`
- `alumni_event_registrations`
- `alumni_surveys`
- `alumni_survey_responses`
- `alumni_contributions`

## Validação antes de merge
Executar `npm test`, `npm run siga:check`, `npm run build` e rever a migração em ambiente Supabase de teste antes de produção.
