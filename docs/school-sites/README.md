# SIGA Plus · Sites institucionais por escola

Esta é a documentação **própria** do módulo `school-sites`, diferente do site comercial SIGA (`painel/web`) e do modelo ISPAB (`painel/escolas`).

## Comece aqui

- [Arquitectura e contrato funcional](../architecture/SCHOOL_SITES_MULTITENANT.md)
- [Operações / rollout / rollback](./RUNBOOK.md)
- [Contrato visual de fidelidade ao ISPAB](./VISUAL_CONTRACT.md)
- [API pública de candidaturas (existente)](../architecture/SCHOOL_WEBSITE_API.md)
- [Domínios canónicos](../domains/OVERVIEW.md)
- [Regras da base de dados](../agents/DATABASE_RULES.md)
- [Regras para agentes](../../.cursor/skills/siga-school-sites/SKILL.md)

## Fase 1: website institucional simples

**Rotas novas previstas na PR #200:**

| Endereço (no hostname da escola) | Permissão | Descrição |
| --- | --- | --- |
| `/site` | Público | Website publicado |
| `/api/public/school-site` | Público | Apenas snapshot publicado |
| `/configuracoes/site` | Administrador da escola | Editar e publicar |
| `/` | SIGA existente | Portal com login e módulos actuais |

O sistema não exige migração SQL para esta fase: usa o domínio `school_website` da tabela existente `school_settings`, com inserções versionadas, RLS, AAL2 e consulta à versão mais recente. O conteúdo default é calculado, mas não exposto publicamente sem publicação explícita. `published` e `draft` são separados.

## Limites da entrega

Não confundir esta fase com um CMS WordPress ou Moodle Sites completo. **Ainda não estão entregues:** criador de páginas/blocos, catálogos públicos dinâmicos, gestor multimédia integrado, CSS customizável amplo, domínio próprio self-service, publicação automática na raiz do hostname, SEO dinâmico e deploy em produção.

Não aplicar o blueprint da documentação como se fosse uma funcionalidade já concluída.

## Contactos

Contribuições e revisões técnicas devem ir para a PR #200, com evidências dos testes e links de CI.
