# Mapa de módulos SIGA

Fonte de verdade: [`scripts/siga/modules.json`](../../scripts/siga/modules.json).

| id           | Skill               | Rotas                            | Feature                                       |
| ------------ | ------------------- | -------------------------------- | --------------------------------------------- |
| dashboard    | `siga-dashboard`    | `/`                              | `features/dashboard`, `TeacherWorkspacePanel` |
| alunos       | `siga-alunos`       | `/alunos`, `/alunos/$id`         | `features/students`                           |
| pessoas      | `siga-pessoas`      | `/pessoas`, `/professores/$id`   | `features/people`                             |
| pedagogica   | `siga-pedagogica`   | `/pedagogica`                    | `features/academic`                           |
| financeiro   | `siga-financeiro`   | `/financeiro`, `/faturas`        | `features/finance`                            |
| documentos   | `siga-documentos`   | `/documentos`                    | `features/documents`                          |
| calendario   | `siga-calendario`   | `/calendario`, `/calendario/ics` | `features/calendar`                           |
| comunicacoes | `siga-comunicacoes` | `/comunicacoes`                  | `features/communications`                     |
| acessos      | `siga-acessos`      | `/acessos`                       | `features/access`, `access-policy`            |
| matricula    | `siga-matricula`    | `/matricula/$slug`               | `features/enrollment`                         |
| integracoes  | `siga-integracoes`  | Settings, waffle                 | `features/integrations`                       |
| arquivos     | `siga-arquivos`     | `/arquivos` (waffle)             | `features/arquivos`                           |

## Integrações (catalog-ready)

- Pacotes e capacidades: `features/integrations/install.ts`
- Acções in-app: `features/integrations/actions.ts` + `InstalledModuleTools`
- Instalar/revogar: `features/integrations/server.ts` → `school_integrations`
- Rotas públicas: `publicInstalledProviderIds`, `publicSchoolPhone`, `publicSchoolEmail` (sem tokens)
- Testes: `tests/integrations/install.test.ts`, `launcher.test.ts`, `actions.test.ts`

Padrão de pastas:

```
src/features/<id>/schemas.ts
src/features/<id>/server.ts
src/routes/<rota>.tsx
tests/<id>/schemas.test.ts
.cursor/skills/siga-<id>/SKILL.md
```

Criar o próximo: `npm run siga:scaffold -- <id> --with-page`.
