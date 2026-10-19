-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-18
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: transporte escolar (viaturas, rotas, paragens, alunos de cada rota
-- e estado do dia). Cria 5 tabelas só do servidor (sem acesso directo pela API).
-- Verificar em staging antes de aplicar: acrescenta chaves estrangeiras compostas
-- e índices únicos, sem apagar dados existentes. Uma referência inválida impede a aplicação.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261018120000_school_transport.sql ══════════
-- Transporte escolar: viaturas, rotas, paragens, alunos de cada rota e o
-- estado do serviço por dia. Plano: docs/agents/TRANSPORTE_PLANO.md.
--
-- Paragem + hora + aluno é a morada de um menor: as cinco tabelas são só do
-- servidor (DATABASE_RULES, regra 5) — sem políticas, FORCE RLS e sem acesso
-- de anon/authenticated. O portal grava pelas server functions de
-- src/features/transport/ (Administrador/Secretaria ou permissão «Gestão») e
-- o aluno lê só a sua rota pela API Mobile V4.
-- Pode correr mais do que uma vez.

CREATE TABLE IF NOT EXISTS public.siga_transport_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plate text NOT NULL CHECK (length(btrim(plate)) BETWEEN 2 AND 20),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  seats integer NOT NULL CHECK (seats BETWEEN 1 AND 120),
  driver_name text CHECK (driver_name IS NULL OR length(btrim(driver_name)) BETWEEN 1 AND 120),
  driver_phone text CHECK (driver_phone IS NULL OR length(btrim(driver_phone)) BETWEEN 6 AND 20),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_transport_vehicles_plate_unique UNIQUE (school_id, plate)
);

CREATE TABLE IF NOT EXISTS public.siga_transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  direction text NOT NULL DEFAULT 'both'
    CHECK (direction IN ('outbound', 'return', 'both')),
  vehicle_id uuid REFERENCES public.siga_transport_vehicles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_transport_routes_name_unique UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.siga_transport_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.siga_transport_routes(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 200),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  landmark text CHECK (landmark IS NULL OR length(landmark) <= 200),
  outbound_time time,
  return_time time,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_transport_stops_sequence_unique UNIQUE (route_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.siga_transport_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.siga_transport_routes(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES public.siga_transport_stops(id) ON DELETE RESTRICT,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_transport_assignments_period CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE TABLE IF NOT EXISTS public.siga_transport_day_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.siga_transport_routes(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  status text NOT NULL DEFAULT 'normal'
    CHECK (status IN ('normal', 'delayed', 'cancelled')),
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes BETWEEN 0 AND 240),
  note text CHECK (note IS NULL OR length(note) <= 300),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siga_transport_day_status_unique UNIQUE (route_id, service_date)
);

CREATE INDEX IF NOT EXISTS siga_transport_routes_school_idx
  ON public.siga_transport_routes (school_id);
CREATE INDEX IF NOT EXISTS siga_transport_stops_route_idx
  ON public.siga_transport_stops (school_id, route_id);
CREATE INDEX IF NOT EXISTS siga_transport_assignments_student_idx
  ON public.siga_transport_assignments (school_id, student_id);
CREATE INDEX IF NOT EXISTS siga_transport_assignments_route_idx
  ON public.siga_transport_assignments (school_id, route_id);
-- Um aluno tem no máximo uma atribuição em aberto por rota.
CREATE UNIQUE INDEX IF NOT EXISTS siga_transport_assignments_open_unique
  ON public.siga_transport_assignments (route_id, student_id)
  WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS siga_transport_day_status_date_idx
  ON public.siga_transport_day_status (school_id, service_date);

-- FKs compostas garantem o isolamento mesmo que um registo de origem mude de
-- escola/rota depois de gravado. Os gatilhos seguintes continuam activos:
-- verificam a intenção na escrita; a FK protege também UPDATE/DELETE do pai.
-- Índices únicos reutilizáveis não alteram a chave primária original.
CREATE UNIQUE INDEX IF NOT EXISTS siga_transport_vehicles_school_identity_idx
  ON public.siga_transport_vehicles (school_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS siga_transport_routes_school_identity_idx
  ON public.siga_transport_routes (school_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS siga_transport_stops_route_identity_idx
  ON public.siga_transport_stops (school_id, route_id, id);
-- A tabela students já possui UNIQUE (school_id, id) no esquema base.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.siga_transport_routes'::regclass
      AND conname = 'siga_transport_route_vehicle_school_fk'
  ) THEN
    ALTER TABLE public.siga_transport_routes
      ADD CONSTRAINT siga_transport_route_vehicle_school_fk
      FOREIGN KEY (school_id, vehicle_id)
      REFERENCES public.siga_transport_vehicles (school_id, id)
      ON DELETE SET NULL (vehicle_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.siga_transport_stops'::regclass
      AND conname = 'siga_transport_stop_route_school_fk'
  ) THEN
    ALTER TABLE public.siga_transport_stops
      ADD CONSTRAINT siga_transport_stop_route_school_fk
      FOREIGN KEY (school_id, route_id)
      REFERENCES public.siga_transport_routes (school_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.siga_transport_assignments'::regclass
      AND conname = 'siga_transport_assignment_student_school_fk'
  ) THEN
    ALTER TABLE public.siga_transport_assignments
      ADD CONSTRAINT siga_transport_assignment_student_school_fk
      FOREIGN KEY (school_id, student_id)
      REFERENCES public.students (school_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.siga_transport_assignments'::regclass
      AND conname = 'siga_transport_assignment_route_school_fk'
  ) THEN
    ALTER TABLE public.siga_transport_assignments
      ADD CONSTRAINT siga_transport_assignment_route_school_fk
      FOREIGN KEY (school_id, route_id)
      REFERENCES public.siga_transport_routes (school_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.siga_transport_assignments'::regclass
      AND conname = 'siga_transport_assignment_stop_route_school_fk'
  ) THEN
    ALTER TABLE public.siga_transport_assignments
      ADD CONSTRAINT siga_transport_assignment_stop_route_school_fk
      FOREIGN KEY (school_id, route_id, stop_id)
      REFERENCES public.siga_transport_stops (school_id, route_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.siga_transport_day_status'::regclass
      AND conname = 'siga_transport_day_route_school_fk'
  ) THEN
    ALTER TABLE public.siga_transport_day_status
      ADD CONSTRAINT siga_transport_day_route_school_fk
      FOREIGN KEY (school_id, route_id)
      REFERENCES public.siga_transport_routes (school_id, id)
      ON DELETE CASCADE;
  END IF;
END
$migration$;

-- Referências na mesma escola (auditoria da PR #132): as chaves estrangeiras só
-- garantem que o id existe; este gatilho garante que a viatura, a rota, a
-- paragem e o aluno são da escola da linha, e que a paragem é da rota. O
-- servidor já filtra por escola; isto fecha o mesmo erro na própria base.
CREATE OR REPLACE FUNCTION private.validate_transport_school_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'siga_transport_routes' THEN
    IF NEW.vehicle_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.siga_transport_vehicles AS v
      WHERE v.id = NEW.vehicle_id AND v.school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'Viatura não pertence à escola da rota'
        USING ERRCODE = '23503', CONSTRAINT = 'transport_route_vehicle_same_school';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.siga_transport_routes AS r
    WHERE r.id = NEW.route_id AND r.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'Rota não pertence à escola'
      USING ERRCODE = '23503', CONSTRAINT = 'transport_route_same_school';
  END IF;

  IF TG_TABLE_NAME = 'siga_transport_assignments' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.students AS st
      WHERE st.id = NEW.student_id AND st.school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'Aluno não pertence à escola da rota'
        USING ERRCODE = '23503', CONSTRAINT = 'transport_assignment_student_same_school';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.siga_transport_stops AS sp
      WHERE sp.id = NEW.stop_id
        AND sp.route_id = NEW.route_id
        AND sp.school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'Paragem não pertence à rota'
        USING ERRCODE = '23503', CONSTRAINT = 'transport_assignment_stop_same_route';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_transport_school_references() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_transport_route_school ON public.siga_transport_routes;
CREATE TRIGGER validate_transport_route_school
  BEFORE INSERT OR UPDATE OF school_id, vehicle_id ON public.siga_transport_routes
  FOR EACH ROW EXECUTE FUNCTION private.validate_transport_school_references();
DROP TRIGGER IF EXISTS validate_transport_stop_school ON public.siga_transport_stops;
CREATE TRIGGER validate_transport_stop_school
  BEFORE INSERT OR UPDATE OF school_id, route_id ON public.siga_transport_stops
  FOR EACH ROW EXECUTE FUNCTION private.validate_transport_school_references();
DROP TRIGGER IF EXISTS validate_transport_assignment_school ON public.siga_transport_assignments;
CREATE TRIGGER validate_transport_assignment_school
  BEFORE INSERT OR UPDATE OF school_id, route_id, stop_id, student_id
  ON public.siga_transport_assignments
  FOR EACH ROW EXECUTE FUNCTION private.validate_transport_school_references();
DROP TRIGGER IF EXISTS validate_transport_day_status_school ON public.siga_transport_day_status;
CREATE TRIGGER validate_transport_day_status_school
  BEFORE INSERT OR UPDATE OF school_id, route_id ON public.siga_transport_day_status
  FOR EACH ROW EXECUTE FUNCTION private.validate_transport_school_references();

-- siga_transport_vehicles
DROP TRIGGER IF EXISTS siga_transport_vehicles_touch ON public.siga_transport_vehicles;
CREATE TRIGGER siga_transport_vehicles_touch
  BEFORE UPDATE ON public.siga_transport_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS audit_siga_transport_vehicles ON public.siga_transport_vehicles;
CREATE TRIGGER audit_siga_transport_vehicles
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_transport_vehicles
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
ALTER TABLE public.siga_transport_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_transport_vehicles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_transport_vehicles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_transport_vehicles TO service_role;

-- siga_transport_routes
DROP TRIGGER IF EXISTS siga_transport_routes_touch ON public.siga_transport_routes;
CREATE TRIGGER siga_transport_routes_touch
  BEFORE UPDATE ON public.siga_transport_routes
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS audit_siga_transport_routes ON public.siga_transport_routes;
CREATE TRIGGER audit_siga_transport_routes
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_transport_routes
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
ALTER TABLE public.siga_transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_transport_routes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_transport_routes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_transport_routes TO service_role;

-- siga_transport_stops
DROP TRIGGER IF EXISTS siga_transport_stops_touch ON public.siga_transport_stops;
CREATE TRIGGER siga_transport_stops_touch
  BEFORE UPDATE ON public.siga_transport_stops
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS audit_siga_transport_stops ON public.siga_transport_stops;
CREATE TRIGGER audit_siga_transport_stops
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_transport_stops
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
ALTER TABLE public.siga_transport_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_transport_stops FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_transport_stops FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_transport_stops TO service_role;

-- siga_transport_assignments
DROP TRIGGER IF EXISTS siga_transport_assignments_touch ON public.siga_transport_assignments;
CREATE TRIGGER siga_transport_assignments_touch
  BEFORE UPDATE ON public.siga_transport_assignments
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS audit_siga_transport_assignments ON public.siga_transport_assignments;
CREATE TRIGGER audit_siga_transport_assignments
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_transport_assignments
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
ALTER TABLE public.siga_transport_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_transport_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_transport_assignments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_transport_assignments TO service_role;

-- siga_transport_day_status
DROP TRIGGER IF EXISTS siga_transport_day_status_touch ON public.siga_transport_day_status;
CREATE TRIGGER siga_transport_day_status_touch
  BEFORE UPDATE ON public.siga_transport_day_status
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
DROP TRIGGER IF EXISTS audit_siga_transport_day_status ON public.siga_transport_day_status;
CREATE TRIGGER audit_siga_transport_day_status
  AFTER INSERT OR DELETE OR UPDATE ON public.siga_transport_day_status
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();
ALTER TABLE public.siga_transport_day_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_transport_day_status FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_transport_day_status FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_transport_day_status TO service_role;

-- ══════════ Confirmação ══════════
-- A simples existência das tabelas não é suficiente: confirmar também as
-- relações entre escolas, rotas e alunos. Consulta de leitura.
SELECT CASE WHEN to_regclass('public.siga_transport_vehicles') IS NOT NULL
  AND to_regclass('public.siga_transport_routes') IS NOT NULL
  AND to_regclass('public.siga_transport_stops') IS NOT NULL
  AND to_regclass('public.siga_transport_assignments') IS NOT NULL
  AND to_regclass('public.siga_transport_day_status') IS NOT NULL
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.siga_transport_routes')
    AND conname = 'siga_transport_route_vehicle_school_fk')
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.siga_transport_stops')
    AND conname = 'siga_transport_stop_route_school_fk')
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.siga_transport_assignments')
    AND conname = 'siga_transport_assignment_student_school_fk')
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.siga_transport_assignments')
    AND conname = 'siga_transport_assignment_route_school_fk')
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.siga_transport_assignments')
    AND conname = 'siga_transport_assignment_stop_route_school_fk')
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.siga_transport_day_status')
    AND conname = 'siga_transport_day_route_school_fk')
  THEN 'aplicada' ELSE 'em falta' END AS transporte_escolar;
