CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_is_first boolean;
BEGIN
  SELECT id INTO v_school
  FROM public.schools
  WHERE deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  v_is_first := NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE school_id IS NOT DISTINCT FROM v_school
  );

  INSERT INTO public.profiles (id, full_name, school_id, cargo)
  VALUES (
    NEW.id,
    left(COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email), 160),
    v_school,
    CASE WHEN v_is_first THEN 'Administrador' ELSE 'Secretaria' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
