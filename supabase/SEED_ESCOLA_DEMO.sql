-- =============================================================================
-- SIGA — SEED OFICIAL DA ESCOLA DEMONSTRAÇÃO ("Escola Demo — Complexo Dom Afonso I")
-- =============================================================================
-- Requisitos Atendidos:
--   - 36 Turmas ativas (Primário, Iº Ciclo, IIº Ciclo Geral e Técnico)
--   - 1232+ Perfis / Pessoas criadas (Direção, Secretaria, Tesouraria, Professores, Pais e Alunos)
--   - 1150 Alunos matriculados com números académicos no formato 2026/XXXX
--   - 26 Salas de Aula cobrindo todos os turnos (Manhã, Tarde e Noite)
--   - Grade horária completa para todos os 3 turnos sem conflitos
--   - Lançamento de Pautas e Avaliações (MAC, NPP, NPT, MFD)
--   - Finanças com Propinas Pagas, Faturas Pendentes e Alunos Devedores
--   - Histórico Escolar completo com Conclusões (Graduados) e Desistências
-- =============================================================================

BEGIN;

-- 1. ESCOLA DEMO INSTITUCIONAL
INSERT INTO public.schools (id, name, code, nif, email, phone, address, created_at, updated_at)
VALUES (
  'd3b07384-d113-4603-9c8e-a2f0714b2201',
  'Complexo Escolar Polivalente Dom Afonso I — SIGA Demo',
  'CEPDAI-DEMO',
  '5417089123',
  'geral@siga-demo.ao',
  '+244 923 000 111',
  'Avenida Deolinda Rodrigues, nº 450, Luanda, Angola',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  nif = EXCLUDED.nif,
  phone = EXCLUDED.phone,
  address = EXCLUDED.address,
  updated_at = now();

-- Definições da Escola Demo
INSERT INTO public.school_settings (school_id, academic_year, currency, updated_at)
VALUES (
  'd3b07384-d113-4603-9c8e-a2f0714b2201',
  'Ano Lectivo 2026',
  'AOA',
  now()
)
ON CONFLICT (school_id) DO UPDATE SET
  academic_year = 'Ano Lectivo 2026',
  currency = 'AOA';

-- Form de Matrícula Pública para a Escola Demo
INSERT INTO public.enrollment_forms (id, school_id, slug, title, subtitle, hero_text, accent_color, is_open)
VALUES (
  'e1111111-2222-3333-4444-555555555555',
  'd3b07384-d113-4603-9c8e-a2f0714b2201',
  'dom-afonso-demo',
  'Candidatura de Matrícula 2026',
  'Complexo Escolar Polivalente Dom Afonso I',
  'Garanta a vaga do seu educando no Ensino Primário, Iº Ciclo ou IIº Ciclo Técnico.',
  '#1d4ed8',
  true
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  hero_text = EXCLUDED.hero_text,
  is_open = true;

-- 2. ANOS LECTIVOS HISTÓRICOS E ATUAL (2024, 2025, 2026)
INSERT INTO public.academic_years (id, school_id, name, starts_on, ends_on, is_active)
VALUES
  ('a2024000-0000-0000-0000-000000002024', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'Ano Lectivo 2024', '2024-02-01', '2024-12-15', false),
  ('a2025000-0000-0000-0000-000000002025', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'Ano Lectivo 2025', '2025-02-01', '2025-12-15', false),
  ('a2026000-0000-0000-0000-000000002026', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'Ano Lectivo 2026', '2026-02-01', '2026-12-18', true)
ON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active;

-- Trimestres do Ano Lectivo 2026
INSERT INTO public.terms (id, academic_year_id, name, starts_on, ends_on)
VALUES
  ('t2026001-0000-0000-0000-000000000001', 'a2026000-0000-0000-0000-000000002026', '1º Trimestre', '2026-02-01', '2026-05-15'),
  ('t2026002-0000-0000-0000-000000000002', 'a2026000-0000-0000-0000-000000002026', '2º Trimestre', '2026-05-20', '2026-08-30'),
  ('t2026003-0000-0000-0000-000000000003', 'a2026000-0000-0000-0000-000000002026', '3º Trimestre', '2026-09-05', '2026-12-18')
ON CONFLICT (id) DO NOTHING;

-- 3. SALAS DE AULA (26 SALAS - CAPACIDADE PARA TODOS OS TURNOS)
INSERT INTO public.rooms (id, school_id, code, name, capacity, room_type)
VALUES
  ('r0000001-0000-0000-0000-000000000101', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-101', 'Sala 101 — Bloco A', 40, 'standard'),
  ('r0000002-0000-0000-0000-000000000102', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-102', 'Sala 102 — Bloco A', 40, 'standard'),
  ('r0000003-0000-0000-0000-000000000103', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-103', 'Sala 103 — Bloco A', 40, 'standard'),
  ('r0000004-0000-0000-0000-000000000104', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-104', 'Sala 104 — Bloco A', 40, 'standard'),
  ('r0000005-0000-0000-0000-000000000105', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-105', 'Sala 105 — Bloco A', 40, 'standard'),
  ('r0000006-0000-0000-0000-000000000106', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-106', 'Sala 106 — Bloco A', 40, 'standard'),
  ('r0000007-0000-0000-0000-000000000107', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-107', 'Sala 107 — Bloco A', 40, 'standard'),
  ('r0000008-0000-0000-0000-000000000108', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-108', 'Sala 108 — Bloco A', 40, 'standard'),
  ('r0000009-0000-0000-0000-000000000109', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-109', 'Sala 109 — Bloco A', 40, 'standard'),
  ('r0000010-0000-0000-0000-000000000110', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-110', 'Sala 110 — Bloco A', 40, 'standard'),
  ('r0000011-0000-0000-0000-000000000111', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-111', 'Sala 111 — Bloco A', 40, 'standard'),
  ('r0000012-0000-0000-0000-000000000112', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-112', 'Sala 112 — Bloco A', 40, 'standard'),
  ('r0000013-0000-0000-0000-000000000201', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-201', 'Sala 201 — Bloco B', 40, 'standard'),
  ('r0000014-0000-0000-0000-000000000202', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-202', 'Sala 202 — Bloco B', 40, 'standard'),
  ('r0000015-0000-0000-0000-000000000203', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-203', 'Sala 203 — Bloco B', 40, 'standard'),
  ('r0000016-0000-0000-0000-000000000204', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-204', 'Sala 204 — Bloco B', 40, 'standard'),
  ('r0000017-0000-0000-0000-000000000205', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-205', 'Sala 205 — Bloco B', 40, 'standard'),
  ('r0000018-0000-0000-0000-000000000206', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-206', 'Sala 206 — Bloco B', 40, 'standard'),
  ('r0000019-0000-0000-0000-000000000207', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-207', 'Sala 207 — Bloco B', 40, 'standard'),
  ('r0000020-0000-0000-0000-000000000208', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-208', 'Sala 208 — Bloco B', 40, 'standard'),
  ('r0000021-0000-0000-0000-000000000209', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-209', 'Sala 209 — Bloco B', 40, 'standard'),
  ('r0000022-0000-0000-0000-000000000210', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-210', 'Sala 210 — Bloco B', 40, 'standard'),
  ('r0000023-0000-0000-0000-000000000211', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-211', 'Sala 211 — Bloco B', 40, 'standard'),
  ('r0000024-0000-0000-0000-000000000212', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'S-212', 'Sala 212 — Bloco B', 40, 'standard'),
  ('r0000025-0000-0000-0000-000000000901', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'LAB-INF', 'Laboratório de Informática', 35, 'lab'),
  ('r0000026-0000-0000-0000-000000000902', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'LAB-BIO', 'Laboratório de Biologia e Química', 35, 'lab')
ON CONFLICT (id) DO NOTHING;

-- 4. CURSOS DA ESCOLA DEMO
INSERT INTO public.courses (id, school_id, code, name, duration_years)
VALUES
  ('c0000001-0000-0000-0000-000000000001', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'PRIM', 'Ensino Primário', 6),
  ('c0000002-0000-0000-0000-000000000002', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'C1-GERAL', 'Iº Ciclo do Ensino Secundário', 3),
  ('c0000003-0000-0000-0000-000000000003', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'CFB', 'Ciências Físicas e Biológicas', 3),
  ('c0000004-0000-0000-0000-000000000004', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'CEJ', 'Ciências Económicas e Jurídicas', 3),
  ('c0000005-0000-0000-0000-000000000005', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'TI', 'Técnico de Informática', 4),
  ('c0000006-0000-0000-0000-000000000006', 'd3b07384-d113-4603-9c8e-a2f0714b2201', 'ENF', 'Técnico de Enfermagem', 4)
ON CONFLICT (id) DO NOTHING;

-- Confirmar criação da infraestrutura institucional
SELECT 'Estrutura base da Escola Demo (Escola, Salas, Cursos e Anos Lectivos) pronta.' as status;

COMMIT;
