# Integração dos PRs abertos — 12/11/2026

Pedido do proprietário: resolver todos os PRs abertos, incluindo os mais antigos, numa
triagem segura, sem tocar na `main` (excepto a #441). Ramo de integração:
`claude/modest-shannon-46v4v1`, a partir da `main` `95483017` (com a #441).

## O que foi feito

- **#441 fundida na `main`** (squash `95483017`), com o CI verde e autorização expressa.
- **Integradas no ramo**, com os conflitos resolvidos:

| PR | Como | Notas |
| --- | --- | --- |
| #405 | merge | Formulários fiáveis e suspensões em lote; sem conflitos |
| #403 | merge | E2E de duas escolas só em staging; sem conflitos |
| #404 | merge | Cache por escola, WhatsApp e gravação académica transaccional |
| #408 | merge | Pessoas e Ficha da Turma; fica o `text-destructive-strong` da #423 |
| #375 | merge | Início operacional por separadores, com os ajustes de hover e cartões da `main` |
| #291 | merge | Fica o portão de staging da `main`; entram a auditoria de resíduos e a documentação |
| #275 | merge | Guardas de publicação do website; base falsa dos testes com `.is()` e `.limit()` |
| #277 | merge | Website Studio (Puck); `happy-dom` 21.0.4 e `re2js` 2.9.1 nos overrides |
| #345 (+#338) | merge | Horários da #338; gravação académica fica a da #404 |
| #128 | merge | Só o que a `main` não refez (boletim, importação, comunicações agendadas, RH) |
| #118 | squash | Correcções da auditoria 14, **sem** os ciclos de matrícula (ver abaixo) |
| #211 | squash | Nº de aluno nas listas e impressões; numeração já estava na `main` (#148) |

Regra seguida nos conflitos: quando a `main` refez a mesma correcção mais tarde
(leituras paginadas, SAF-T, Superior, matrícula idempotente, excepção AAL1 de 28/10), fica
a versão da `main` e entra apenas o que o PR tinha de único. Os squashes deixam o resto do
ramo original disponível para integração futura.

## Condições antes de fundir o ramo na `main`

1. **Migração `20261031000000_academic_write_integrity.sql` (#404) aplicada e validada no
   destino.** Sem as RPC transaccionais, a gravação de notas e devoluções é recusada.
2. **Horários só publicados (#338).** O horário dos portais (aluno, encarregado,
   professor) e a chamada do dia passam a vir da agenda **publicada**
   (`academic_schedules.status = 'published'`). Na `main` vinham de todos os
   `timetable_slots` activos. Uma turma que nunca publicou o horário fica sem aulas no
   portal e sem sessões na chamada. Confirmar na produção que as escolas publicaram os
   horários, ou decidir uma alternativa (por exemplo, manter as aulas activas para turmas
   sem nenhum horário publicado) — a #338 tem testes que pedem o contrário.
3. Validação autenticada com contas controladas de duas escolas (ver as handoffs da #345).
4. Não aplicar `supabase/SEED_DEMO_HORARIOS_2026.sql` nem `PURGE_DEMO_HORARIOS_2026.sql`
   nas escolas reais.

## O que ficou de fora, para decisão do proprietário

- **#118 — ciclos de matrícula e filtro «Sem matrícula».** Bloqueiam matrículas novas
  durante os períodos de aulas (só a Administração, com motivo) e trazem a migração
  `20261012100000_enrollment_cycle_guard.sql`, por aplicar. Ficaram também de fora o
  redesenho do cabeçalho e do painel de notificações (anterior ao contrato visual de
  23/10) e a numeração das pró-formas por data e hora (a `main` decidiu outra).
- **#206 — camada de conteúdo do website escolar (`painel/escolas/content/`).** Útil (ver a
  triagem 19), mas pede regenerar `src/features/school-website/template.json` com
  `scripts/siga/sync-school-website-template.mjs` e uma decisão sobre a política de versões
  do modelo. O #205 está contido no #206.
- **#210 — cobrança de assinaturas configurável.** Colide com a arquitectura actual: a
  cobrança passou para o PayFlow/ADMIN e a configuração inicial vive em
  `/configuracoes/inicio` (#433). Traz uma migração.
- **#130 — assistente de IA local (Ollama/Qdrant).** Módulo novo com migração, rota,
  segredos do Worker e infra externa.

## Fechados por estarem substituídos

#424 (já na `main`), #339 (entrou pela #341), #439 (entrou pela #396), #154 (entrou pela
#354), #342 (plano de agentes de 26/10 já cumprido), #200 (motor editorial paralelo,
substituído pela #275), #205 (contido no #206), #35, #116, #119, #132, #133, #136 e #212
(app móvel V4 e versões antigas do Flutter/estudo YFT; a auditoria de 27/10 pede que a
arquitectura `mobile-v4` não seja restaurada sem decisão). Os ramos continuam no GitHub.

## Verificação do ramo de integração

- `npm run typecheck`: sem erros.
- `vitest run` completo: ver o resultado registado no PR de integração.
- ESLint: 0 erros; os mesmos 61 avisos da `main`.
- `check:style`, `check:a11y`, `check-modules.mjs`: aprovados.
- `bun run build` (cliente, SSR e Worker): aprovado; `routeTree.gen.ts` sem alterações.
- `bun install --frozen-lockfile`: sem alterações ao `bun.lock`.
- 55 ensaios SQL em PGlite (`tests/sql/*.mjs`): aprovados.
