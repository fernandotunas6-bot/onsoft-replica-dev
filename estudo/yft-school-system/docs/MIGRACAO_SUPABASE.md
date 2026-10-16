# Passar a app para o Supabase do SIGA

**Objectivo:** a app Flutter passa a ser a app móvel do SIGA. Contas do SIGA
(Supabase Auth do projecto `xodgfmxiaunpamctfeea`) e os dados que a escola já
gere no SIGA, em vez do Firebase e da base D1 própria.

## Regras

- **Não se cria nem altera nada no esquema de produção.** A app usa as tabelas
  que o SIGA já tem (`students`, `student_guardians`, `enrollments`,
  `class_groups`, `school_announcements`, …). Ver
  `docs/agents/DATABASE_RULES.md`.
- As tabelas sensíveis têm RLS forçado: a app **não** as lê directamente. Lê
  pela API `/api/sga/*` deste Worker, que valida a sessão Supabase, decide o
  que a conta pode ver e só depois consulta, com a chave de servidor.
- A chave de servidor (`SGA_SUPABASE_SECRET_KEY`) é segredo do Worker. A URL e
  a chave publicável são públicas (`wrangler.siga.jsonc`).
- A API Mobile V4 (`m.portal-siga.com`) continua a ser a do aluno e do
  professor; o seu código não está neste repositório. `/api/sga` cobre o que
  ela não tem, a começar pelo encarregado.

## Fases

| Fase | O quê | Estado |
| ---- | ----- | ------ |
| 1 | API de leitura do encarregado: `GET /api/sga/me`, `/wards`, `/notices` | feito (testes em `school-worker/test/sga.spec.ts`) |
| 2 | Entrada na app com a conta do SIGA (Supabase Auth) e ecrãs do encarregado a ler `/api/sga` | por fazer |
| 3 | Mais leituras: horário (`timetable_slots`), faltas (`attendance_records` por matrícula), boletim (`grade_scores`), recibos (`finance_receipts`) | por fazer |
| 4 | Escritas do professor (presenças, notas) e mensagens, com as regras e a auditoria do SIGA | por fazer |
| 5 | Desligar o Firebase e a base D1 | por fazer |

## Regras de acesso de `/api/sga` (iguais às do SIGA)

- Vínculo: `school_memberships` activos da conta; papéis por `member_roles` →
  `roles.code` (mesmo mapa de `src/integrations/supabase/sga.ts`). A escola
  pedida em `X-School-Id` só vale se for um desses vínculos.
- Ficha da conta: `people.user_id`; se não houver, `people.email` igual ao
  e-mail **confirmado** da conta e só se houver uma única ficha com ele.
- Educandos: `student_guardians` dessa ficha, nesta escola, com ligação em
  vigor (`valid_until` vazio ou hoje/depois, hora de Luanda).
- Comunicados: `status = sent`, não apagados, público `all_guardians` e, se
  algum educando tiver factura vencida por pagar, `guardians_with_debt`.
- Uma leitura falhada responde 503, nunca uma lista vazia.

## Pôr no ar (dono)

```sh
cd estudo/yft-school-system/school-worker
npx wrangler secret put SGA_SUPABASE_SECRET_KEY --config wrangler.siga.jsonc
npx wrangler deploy --config wrangler.siga.jsonc
```

Ou, com o script, exportar `SGA_SUPABASE_SECRET_KEY` antes de
`scripts/publicar-siga.sh teste`.
