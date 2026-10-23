# `drizzle/` — modelo de dados substituído. **Não aplicar.**

Estas migrações e o `schema.ts` descrevem a primeira geração do modelo de dados do
SIGA, abandonada. **Não são o esquema da produção** e aplicá-las criaria um modelo
paralelo vazio ao lado do que está em uso.

O que vale hoje:

| Onde                                       | Estado                                         |
| ------------------------------------------ | ---------------------------------------------- |
| `supabase/migrations/`                     | **vivo** — é daqui que a produção é construída |
| `painel/payflow` (D1)                      | **vivo** — base própria do PayFlow             |
| `drizzle/`                                 | substituído — este directório                  |
| `supabase/migrations-lovable-nao-aplicar/` | substituído, como o nome diz                   |

A fonte de verdade do esquema não são as migrações mas o retrato da produção, em
`supabase/PRODUCTION_SNAPSHOT.json` (`npm run siga:db-snapshot`). Os tipos saem de
lá por `npm run siga:gen-types`, para `src/integrations/supabase/types.sga.ts`.

Mantido só como histórico. Antes de apagar, confirmar que nada em `drizzle.config.ts`
nem nos workflows o referencia.
