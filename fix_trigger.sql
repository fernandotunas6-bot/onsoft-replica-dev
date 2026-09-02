CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_full_name text;
  v_avatar_url text;
  v_phone text;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );
  v_avatar_url := NEW.raw_user_meta_data ->> 'avatar_url';
  v_phone := COALESCE(
    NEW.raw_user_meta_data ->> 'phone_primary',
    NEW.raw_user_meta_data ->> 'phone'
  );

  INSERT INTO public.profiles (
    id,
    full_name,
    display_name,
    avatar_url,
    phone,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_full_name,
    v_avatar_url,
    v_phone,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    updated_at = now();

  RETURN NEW;
END;
$function$;
