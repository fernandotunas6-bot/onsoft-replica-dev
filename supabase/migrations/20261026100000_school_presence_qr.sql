-- QR da escola para a presença dos professores.
--
-- Pedido do proprietário (26/10/2026): o director mostra um QR, único para todos os
-- professores, e cada professor lê-o no portal (telemóvel) antes da aula e da chamada.
-- Tem de poder desligar-se e funcionar sem rede em zonas remotas. O objectivo é travar
-- quem finge dar aulas sem ir à escola.
--
-- siga_school_presence_settings: modo por escola (qr / button / off), segredo do QR
--   (nunca sai do servidor; o ecrã recebe só a chave do dia), rotação, QR impresso,
--   zona da escola (centro e raio) e tolerância offline.
-- siga_teacher_presence_scans: cada leitura válida, com a decisão (aceite, por rever,
--   recusada), os motivos, a distância à escola e as aulas que confirmou. As
--   coordenadas exactas não se guardam: só a distância e a precisão.
--
-- Só o servidor lê e escreve (FORCE RLS e REVOKE): o segredo e a assiduidade do
-- pessoal não são para o navegador. Idempotente.

CREATE TABLE IF NOT EXISTS public.siga_school_presence_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'button' CHECK (mode IN ('off', 'button', 'qr')),
  qr_secret text NOT NULL CHECK (char_length(qr_secret) BETWEEN 32 AND 128),
  qr_secret_version integer NOT NULL DEFAULT 1 CHECK (qr_secret_version >= 1),
  rotation_seconds integer NOT NULL DEFAULT 30 CHECK (rotation_seconds BETWEEN 15 AND 300),
  allow_printed boolean NOT NULL DEFAULT true,
  require_location boolean NOT NULL DEFAULT true,
  center_latitude double precision CHECK (center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90),
  center_longitude double precision CHECK (center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180),
  geofence_radius_m integer NOT NULL DEFAULT 250 CHECK (geofence_radius_m BETWEEN 50 AND 5000),
  offline_max_hours integer NOT NULL DEFAULT 72 CHECK (offline_max_hours BETWEEN 1 AND 168),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_school_presence_settings_center_check
    CHECK ((center_latitude IS NULL) = (center_longitude IS NULL))
);

CREATE TABLE IF NOT EXISTS public.siga_teacher_presence_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  qr_kind text NOT NULL CHECK (qr_kind IN ('rotating', 'printed')),
  qr_step bigint NOT NULL,
  scanned_at timestamptz NOT NULL,
  device_scanned_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  offline boolean NOT NULL DEFAULT false,
  distance_m integer CHECK (distance_m IS NULL OR distance_m >= 0),
  accuracy_m integer CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  inside_geofence boolean,
  location_mocked boolean,
  device_id text CHECK (device_id IS NULL OR char_length(device_id) <= 128),
  client_op_id uuid,
  decision text NOT NULL CHECK (decision IN ('accepted', 'review', 'rejected')),
  reasons text[] NOT NULL DEFAULT '{}',
  session_ids uuid[] NOT NULL DEFAULT '{}',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- O mesmo envio offline repetido devolve a mesma leitura.
CREATE UNIQUE INDEX IF NOT EXISTS siga_teacher_presence_scans_op_key
  ON public.siga_teacher_presence_scans (school_id, client_op_id);
CREATE INDEX IF NOT EXISTS siga_teacher_presence_scans_school_time_idx
  ON public.siga_teacher_presence_scans (school_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS siga_teacher_presence_scans_teacher_time_idx
  ON public.siga_teacher_presence_scans (school_id, teacher_id, scanned_at DESC);

DROP TRIGGER IF EXISTS siga_school_presence_settings_touch ON public.siga_school_presence_settings;
CREATE TRIGGER siga_school_presence_settings_touch
  BEFORE UPDATE ON public.siga_school_presence_settings
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.siga_school_presence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_school_presence_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_school_presence_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_school_presence_settings TO service_role;

ALTER TABLE public.siga_teacher_presence_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_teacher_presence_scans FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_teacher_presence_scans FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_teacher_presence_scans TO service_role;

COMMENT ON TABLE public.siga_school_presence_settings IS
  'Presença dos professores por QR da escola: modo, segredo (só servidor), zona e tolerâncias.';
COMMENT ON TABLE public.siga_teacher_presence_scans IS
  'Leituras do QR da escola pelos professores, com a decisão e os motivos. Só servidor.';
