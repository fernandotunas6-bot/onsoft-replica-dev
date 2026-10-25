-- Catracas: um só cartão activo por pessoa em cada escola.
--
-- Emitir o cartão lia «já tem cartão activo?» e, se não, criava um. Dois pedidos ao
-- mesmo tempo (duplo clique, duas abas) criavam dois cartões activos; daí em diante a
-- leitura com `.maybeSingle()` dava erro (duas linhas), o erro era ignorado e cada
-- pedido seguinte criava mais um cartão. Leitura de 2026-10-18: 2 cartões, nenhum
-- repetido, por isso o índice cria-se sem mexer em dados. O servidor trata a recusa
-- (23505) devolvendo o cartão que ficou. Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS siga_access_cards_one_active_per_person
  ON public.siga_access_cards (school_id, person_id)
  WHERE status = 'active';
