-- SIGA Plus: prevent Auth users from being created without a profile.
-- Applied to Supabase Sga 2026-09-25, then verified: 97/97 profiles,
-- 3 previously missing profiles now onboarding_status='pending', no new memberships.
-- New identities must be provisioned without school access until independently approved.
-- This file records the already-applied migration; do not reapply blindly if
-- another branch has since changed the Auth trigger.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_candidate text;
  v_display_name text;
  v_full_name text;
BEGIN
  -- User metadata is suitable for display only; never use it for authorization.
  v_candidate := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(btrim(split_part(COALESCE(NEW.email, ''), '@', 1)), '')
  );
  v_display_name := CASE
    WHEN v_candidate IS NULL OR char_length(v_candidate) < 2
      THEN 'Utilizador ' || left(replace(NEW.id::text, '-', ''), 8)
    ELSE left(v_candidate, 160)
  END;
  v_full_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    v_display_name
  );

  INSERT INTO public.profiles (
    id, display_name, full_name, first_name, last_name,
    avatar_url, phone, onboarding_status, created_at, updated_at
  )
  VALUES (
    NEW.id, v_display_name, v_full_name,
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'first_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'last_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'avatar_url'), ''),
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone_primary'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), '')
    ),
    'pending', now(), now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END
$function$


-- Idempotent, narrowly scoped: only missing profiles; no school role or permission changes.
WITH missing AS (
  SELECT u.id, u.email, u.raw_user_meta_data,
    COALESCE(
      NULLIF(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(btrim(u.raw_user_meta_data ->> 'name'), ''),
      NULLIF(btrim(split_part(COALESCE(u.email, ''), '@', 1)), '')
    ) AS candidate
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
), prepared AS (
  SELECT id, raw_user_meta_data,
    CASE WHEN candidate IS NULL OR char_length(candidate) < 2
      THEN 'Utilizador ' || left(replace(id::text, '-', ''), 8)
      ELSE left(candidate, 160)
    END AS safe_display
  FROM missing
)
INSERT INTO public.profiles (
  id, display_name, full_name, first_name, last_name,
  avatar_url, phone, onboarding_status, created_at, updated_at
)
SELECT id, safe_display,
       COALESCE(NULLIF(btrim(raw_user_meta_data ->> 'full_name'), ''),
                NULLIF(btrim(raw_user_meta_data ->> 'name'), ''), safe_display),
       NULLIF(btrim(raw_user_meta_data ->> 'first_name'), ''),
       NULLIF(btrim(raw_user_meta_data ->> 'last_name'), ''),
       NULLIF(btrim(raw_user_meta_data ->> 'avatar_url'), ''),
       COALESCE(NULLIF(btrim(raw_user_meta_data ->> 'phone_primary'), ''),
                NULLIF(btrim(raw_user_meta_data ->> 'phone'), '')),
       'pending', now(), now()
FROM prepared
ON CONFLICT (id) DO NOTHING;

DO $verify$
BEGIN
 IF EXISTS (
  SELECT 1 FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=u.id)
 ) THEN RAISE EXCEPTION 'Profile reconciliation incomplete'; END IF;
END
$verify$;
