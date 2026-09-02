# Relatório de Harmonização: Arquitetura SIGA Plus

Após uma revisão intensiva e execução técnica guiada pelos documentos `ARCHITECTURE_HARMONIZATION.md` e `CONTINUE.md`, a fundação do SIGA Plus (SaaS Multi-Tenant) atingiu a estabilidade exigida.

## 1. Segurança e Isolamento Multi-Tenant (Fases 1 a 12)
**Estado:** ✅ Completo e Verificado

* **Fase 2 (Auth + Profiles):** Quebrámos o limite da tabela `profiles`. A identidade (`auth.users.id`) é agora universal e deixou de estar presa a um único `school_id`.
* **Fase 5 e Fase 12 (RLS & Tenant Isolation):** Encontrámos um *Anti-Pattern* gravíssimo herdado do Supabase inicial: mais de 70 políticas RLS utilizavam a função `current_school_id()`. Num cenário de N-escolas, isto bloqueava a aplicação com o erro *more than one row returned*. 
  * **Ação Executada:** A função foi erradicada dos ficheiros `.sql` canónicos e todas as políticas RLS usam agora `public.is_school_member(school_id)`, garantindo total isolamento e permitindo que um utilizador aceda a múltiplas escolas (ex: Aluno numa, Professor noutra) em segurança.

## 2. Dívida Técnica de Interface (Realtime)
**Estado:** ✅ Saldado

O `CONTINUE.md` sinalizava o erro *0b. Dívida UI: realtime nas DMs e canais de comunicação*.
* **Ação Executada:** Ativámos o `supabase_realtime` na tabela `siga_direct_messages`. Removemos os intervalos de `polling` excessivos (de 8 e 15 segundos) na interface de mensagens e introduzimos subscritores websocket (`channel`) otimizados no `StaffMessenger.tsx` e `use-inbox-unread.ts`. A comunicação é agora instantânea e alivia a Base de Dados.

## 3. Desfragmentação de Monólitos UI
**Estado:** ⏳ Em Curso (pela Equipa de UI)

A extração de componentes massivos (>1.5k linhas) está bastante avançada:
* Componentes pesados da Área Pedagógica (`TurmasWorkspaceTab`, `ScheduleWorkspace`, etc) já estão devidamente alojados em `features/academic/views`.
* O ficheiro `pedagogica.tsx` (1058 linhas) já funciona quase exclusivamente como um Orquestrador (Fetch de Dados) e *Wrapper*.
* O `FileBrowser.tsx` (1527 linhas) e o `AssessmentCenter.tsx` (1783 linhas) requerem a criação de *Custom Hooks* (`useFileBrowser.ts` e `useAssessmentCenter.ts`) para isolar as dezenas de `useState` do JSX. Recomendamos que a equipa de Frontend realize esta extração manualmente para evitar quebras no DOM virtual.

## 4. Integrações e Sincronização EMIS
**Estado:** ⏸️ Fora de Âmbito

A sincronização de Faturas/Pagamentos e dados do Ministério da Educação (EMIS) via Gateways reais (Multicaixa / Unitel) encontra-se sinalizada no documento de continuação como *(só config + plano pending_gateway)*. O código de normalização (`features/integrations/emis.ts`) está funcional.

---

### Próximos Passos
O ecossistema está 100% livre de conflitos TypeScript (`npm run siga:check` a passar) e protegido ao nível da Base de Dados. Pode avançar com o *Sync* seguro para o Lovable.
