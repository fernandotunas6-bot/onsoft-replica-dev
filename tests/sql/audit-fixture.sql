CREATE SCHEMA auth; CREATE SCHEMA private; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; GRANT USAGE ON SCHEMA private TO authenticated;
CREATE TABLE public.people("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"full_name" text NOT NULL,"preferred_name" text,"date_of_birth" date,"sex" text,"national_id" text,"email" text,"phone" text,"status" text DEFAULT 'active'::text NOT NULL,"created_by" uuid NOT NULL,"updated_by" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"photo_path" text,"photo_url" text,"deleted_at" timestamp with time zone,"user_id" uuid,"province" text,"municipality" text,"commune" text,"address" text);
CREATE TABLE public.teachers("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"person_id" uuid NOT NULL,"employee_number" text NOT NULL,"hired_on" date NOT NULL,"employment_type" text NOT NULL,"highest_qualification" text NOT NULL,"status" text DEFAULT 'active'::text NOT NULL,"created_by" uuid NOT NULL,"updated_by" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"user_id" uuid);
CREATE TABLE public.person_roles("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"person_id" uuid NOT NULL,"role" text NOT NULL,"active" boolean DEFAULT true NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"created_by" uuid,"updated_by" uuid,"deleted_at" timestamp with time zone);
CREATE TABLE public.person_documents("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"person_id" uuid NOT NULL,"document_type" text NOT NULL,"document_number" text NOT NULL,"issued_at" date,"expires_at" date,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"created_by" uuid,"updated_at" timestamp with time zone,"updated_by" uuid,"deleted_at" timestamp with time zone,"file_id" uuid,"file_name" text);
CREATE TABLE public.students("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"person_id" uuid NOT NULL,"student_number" text NOT NULL,"admission_date" date DEFAULT CURRENT_DATE NOT NULL,"status" text DEFAULT 'applicant'::text NOT NULL,"created_by" uuid NOT NULL,"updated_by" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"deleted_at" timestamp with time zone);
CREATE TABLE public.student_guardians("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"student_id" uuid NOT NULL,"guardian_person_id" uuid NOT NULL,"relationship" text NOT NULL,"is_primary" boolean DEFAULT false NOT NULL,"is_financially_responsible" boolean DEFAULT false NOT NULL,"is_pickup_authorized" boolean DEFAULT false NOT NULL,"valid_from" date DEFAULT CURRENT_DATE NOT NULL,"valid_until" date,"created_by" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.staff_module_grants("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"user_id" uuid NOT NULL,"module_key" text NOT NULL,"level" text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"created_by" uuid,"updated_by" uuid);
CREATE TABLE public.finance_invoices("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"contract_id" uuid NOT NULL,"fee_item_id" uuid NOT NULL,"invoice_number" text NOT NULL,"competence_month" date,"amount" numeric NOT NULL,"discount_amount" numeric DEFAULT 0 NOT NULL,"due_date" date NOT NULL,"status" text DEFAULT 'open'::text NOT NULL,"issued_by" uuid NOT NULL,"cancelled_at" timestamp with time zone,"cancelled_by" uuid,"cancellation_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"penalty_amount" numeric DEFAULT 0 NOT NULL);
CREATE TABLE public.finance_receipts("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"invoice_id" uuid NOT NULL,"receipt_number" text NOT NULL,"amount" numeric NOT NULL,"paid_on" date NOT NULL,"payment_method" text NOT NULL,"received_by" uuid NOT NULL,"status" text DEFAULT 'issued'::text NOT NULL,"reversed_at" timestamp with time zone,"reversed_by" uuid,"reversal_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"external_id" text);
CREATE TABLE public.roles("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"code" text NOT NULL,"name" text NOT NULL,"is_system" boolean DEFAULT false NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.member_roles("school_id" uuid NOT NULL,"membership_id" uuid NOT NULL,"role_id" uuid NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.school_memberships("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"user_id" uuid NOT NULL,"status" text DEFAULT 'invited'::text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"joined_at" timestamp with time zone DEFAULT now(),"invited_at" timestamp with time zone,"activated_at" timestamp with time zone DEFAULT now(),"suspended_at" timestamp with time zone,"last_access_at" timestamp with time zone);
CREATE TABLE private.student_number_sequences (school_id uuid, period text, next_number bigint default 1,updated_at timestamptz default now(),primary key(school_id,period));
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE SQL AS $$ SELECT current_setting('request.jwt.claim.aal',true)='aal2' $$;
CREATE FUNCTION private.has_permission(uuid,text) RETURNS boolean LANGUAGE SQL AS $$ SELECT exists(select 1 from public.school_memberships sm join public.member_roles mr on mr.membership_id=sm.id join public.roles r on r.id=mr.role_id where sm.school_id=$1 and sm.user_id=auth.uid() and sm.status='active' and r.code='owner') $$;
CREATE OR REPLACE FUNCTION private.register_student(target_school_id uuid, target_person_id uuid, target_admission_date date, target_guardian_person_id uuid DEFAULT NULL::uuid, target_relationship text DEFAULT NULL::text, target_primary_guardian boolean DEFAULT false, target_financial_responsibility boolean DEFAULT false, target_pickup_authorization boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  generated_number bigint;
  generated_student_number text;
  generated_student_id uuid;
  v_period text := 'legacy';
begin
  if (select auth.uid()) is null
     or not private.is_aal2()
     or not private.has_permission(target_school_id, 'students.records.create') then
    raise exception using errcode = '42501', message = 'Sem autorização para cadastrar estudantes.';
  end if;

  if target_admission_date is null or target_admission_date > current_date
     or not exists (
       select 1 from public.people
       where school_id = target_school_id and id = target_person_id and status = 'active'
     ) then
    raise exception using errcode = '22023', message = 'Pessoa ou data de admissão inválida.';
  end if;

  if target_guardian_person_id is not null and (
    target_relationship not in ('mother', 'father', 'guardian', 'sibling', 'grandparent', 'other')
    or target_guardian_person_id = target_person_id
    or not exists (
      select 1 from public.people
      where school_id = target_school_id and id = target_guardian_person_id and status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'Encarregado inválido para esta escola.';
  end if;

  insert into private.student_number_sequences (school_id, period)
  values (target_school_id, v_period)
  on conflict (school_id, period) do nothing;

  select next_number into generated_number
  from private.student_number_sequences
  where school_id = target_school_id and period = v_period
  for update;

  generated_student_number := 'EST-' || lpad(generated_number::text, 6, '0');
  update private.student_number_sequences
  set next_number = generated_number + 1, updated_at = now()
  where school_id = target_school_id and period = v_period;

  insert into public.students (
    school_id, person_id, student_number, admission_date, created_by, updated_by
  ) values (
    target_school_id, target_person_id, generated_student_number,
    target_admission_date, (select auth.uid()), (select auth.uid())
  ) returning id into generated_student_id;

  if target_guardian_person_id is not null then
    insert into public.student_guardians (
      school_id, student_id, guardian_person_id, relationship, is_primary,
      is_financially_responsible, is_pickup_authorized, created_by
    ) values (
      target_school_id, generated_student_id, target_guardian_person_id,
      target_relationship, target_primary_guardian,
      target_financial_responsibility, target_pickup_authorization, (select auth.uid())
    );
  end if;

  return jsonb_build_object(
    'studentId', generated_student_id,
    'studentNumber', generated_student_number,
    'status', 'applicant'
  );
end;
$function$
;
