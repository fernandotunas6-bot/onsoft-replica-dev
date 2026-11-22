-- SIGA AI no catálogo de módulos (#130).
--
-- O catálogo foi reescrito em 20261025120000_module_catalog_vocabulario_actual.sql com
-- os 18 módulos de então. O SIGA AI chega depois: esta migração só acrescenta a sua
-- linha, sem tocar nas outras nem nas escolhas das escolas em `school_modules`.
--
-- Fica adormecido por omissão (`defaultEnabled: false`): precisa do servidor de IA da
-- escola (Ollama e Qdrant) configurado. Uma escola liga-o com uma linha em
-- `school_modules` (status active), como os outros módulos adormecidos.
--
-- Idempotente: pode correr duas vezes. Não mexe em dados das escolas.

begin;

insert into public.module_catalog (code, name, version, is_essential, manifest) values
  ('siga-ai', 'SIGA AI (IA local)', '1.0.0', false, '{"navPath": "/siga-ai", "secondaryNavPaths": [], "skill": "siga-ai", "defaultEnabled": false, "dormantReason": "Precisa do servidor de IA da escola (Ollama e Qdrant) configurado. Desligado por omissão em todas as escolas; uma escola pode ligá-lo com uma linha em school_modules (status active)."}'::jsonb)
on conflict (code) do update
  set name = excluded.name,
      version = excluded.version,
      is_essential = excluded.is_essential,
      manifest = excluded.manifest,
      updated_at = now();

commit;
