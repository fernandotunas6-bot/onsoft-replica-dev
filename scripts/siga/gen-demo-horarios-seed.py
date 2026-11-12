#!/usr/bin/env python3
"""Gera o seed de demonstração dos horários (DH26) e o script que o desfaz.

    python3 scripts/siga/gen-demo-horarios-seed.py

Escreve supabase/SEED_DEMO_HORARIOS_2026.sql e supabase/PURGE_DEMO_HORARIOS_2026.sql.
Os dois ficheiros correm à mão no SQL Editor do Supabase (não são migrações).

Cada linha criada tem um id determinístico, md5('siga-dh26:' || chave), por isso o
seed corre duas vezes sem duplicar e a limpeza apaga exactamente o que ele criou.
Tudo o que é visível fica preso às duas turmas DH26: eventos, fechos e provas não
aparecem na agenda das turmas reais da escola.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "supabase" / "SEED_DEMO_HORARIOS_2026.sql"
PURGE = ROOT / "supabase" / "PURGE_DEMO_HORARIOS_2026.sql"

SCHOOL_CODE = "SIGA-AO-000001"
ACTOR_EMAIL = "valentinocanguele@gmail.com"
# Professor real da escola (conta fernandotunas6@gmail.com): fica com Inglês nas turmas
# de demonstração para o portal do professor ter horário, trabalhos e provas.
LINKED_TEACHER_EMAIL = "fernandotunas6@gmail.com"

created: list[tuple[str, str]] = []  # (tabela, id) pela ordem de criação


def did(key: str, table: str | None = None) -> str:
    value = str(uuid.UUID(hashlib.md5(f"siga-dh26:{key}".encode()).hexdigest()))
    if table:
        created.append((table, value))
    return value


def q(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


# --------------------------------------------------------------------------------------
# Dados
# --------------------------------------------------------------------------------------

ROOMS = [
    # chave, código, nome, tipo, capacidade
    ("s101", "DH26-S101", "Sala D101", "standard", 40),
    ("s102", "DH26-S102", "Sala D102", "standard", 40),
    ("labq", "DH26-LABQ", "Laboratório D de Química e Biologia", "biology_lab", 30),
    ("labf", "DH26-LABF", "Laboratório D de Física", "workshop", 30),
    ("info", "DH26-INFO", "Sala D de Informática", "computer_lab", 30),
    ("pav", "DH26-PAV", "Pavilhão Desportivo D", "auditorium", 80),
]

TEACHERS = [
    # chave, nome, sexo, e-mail, telefone, habilitação, vínculo
    ("mat", "Helena Domingos Sapalo", "female", "helena.sapalo", "+244 923 410 201", "master", "permanent"),
    ("por", "Joaquim Kalunga Ndala", "male", "joaquim.ndala", "+244 923 410 202", "licentiate", "permanent"),
    ("fis", "Rosa Tchinhama Vieira", "female", "rosa.vieira", "+244 923 410 203", "licentiate", "permanent"),
    ("qui", "Paulo Chilala Muti", "male", "paulo.muti", "+244 923 410 204", "master", "fixed_term"),
    ("bio", "Teresa Nangombe Silva", "female", "teresa.silva", "+244 923 410 205", "licentiate", "permanent"),
    ("hum", "Manuel Cassoma Neto", "male", "manuel.neto", "+244 923 410 206", "licentiate", "part_time"),
    ("ing", "Graça Ussova Lumbo", "female", "graca.lumbo", "+244 923 410 207", "licentiate", "permanent"),
    ("efd", "António Kapingala Dias", "male", "antonio.dias", "+244 923 410 208", "bachelor", "part_time"),
]

MORNING = [("07:00", "07:45"), ("07:50", "08:35"), ("08:40", "09:25"), ("09:45", "10:30"), ("10:35", "11:20"), ("11:25", "12:10")]
AFTERNOON = [("13:00", "13:45"), ("13:50", "14:35"), ("14:40", "15:25"), ("15:45", "16:30"), ("16:35", "17:20")]

# Disciplinas por código da escola; professor = chave em TEACHERS ou "linked"; sala.
GROUPS = [
    {
        "key": "10a",
        "code": "DH26-10A",
        "name": "10ª A · Ciências Físicas e Biológicas (demonstração)",
        "grade": ("ESG2-CFB", "10CL", 10),
        "shift": "morning",
        "periods": MORNING,
        "home": "s101",
        "director": "fis",
        "subjects": [
            ("MAT", 5, "mat", "s101"),
            ("PORT", 4, "por", "s101"),
            ("FIS", 4, "fis", "labf"),
            ("QUI", 4, "qui", "labq"),
            ("BIO", 3, "bio", "labq"),
            ("ING", 3, "linked", "s101"),
            ("FILOS", 2, "hum", "s101"),
            ("TIC", 2, "efd", "info"),
            ("EF", 2, "efd", "pav"),
            ("EMPR", 1, "hum", "s101"),
        ],
    },
    {
        "key": "7a",
        "code": "DH26-7A",
        "name": "7ª A · Ensino Geral (demonstração)",
        "grade": ("ESG1", "7CL", 7),
        "shift": "afternoon",
        "periods": AFTERNOON,
        "home": "s102",
        "director": "por",
        "subjects": [
            ("PORT", 5, "por", "s102"),
            ("MAT", 5, "mat", "s102"),
            ("ING", 3, "linked", "s102"),
            ("BIO", 2, "bio", "labq"),
            ("FIS", 2, "fis", "labf"),
            ("QUI", 2, "qui", "labq"),
            ("HIST", 2, "hum", "s102"),
            ("GEO", 2, "hum", "s102"),
            ("EF", 2, "efd", "pav"),
        ],
    },
]

SUBJECT_NAMES = {
    "MAT": "Matemática", "PORT": "Língua Portuguesa", "FIS": "Física", "QUI": "Química",
    "BIO": "Biologia", "ING": "Inglês", "FILOS": "Filosofia", "TIC": "Tecnologias de Informação e Comunicação",
    "EF": "Educação Física", "EMPR": "Empreendedorismo", "HIST": "História", "GEO": "Geografia",
}

TOPICS = {
    "MAT": ["Funções do 1.º grau", "Equações e inequações", "Sistemas de equações", "Estatística descritiva"],
    "PORT": ["Texto narrativo", "Classes de palavras", "Produção de texto argumentativo", "Leitura orientada"],
    "FIS": ["Cinemática: movimento rectilíneo", "Leis de Newton", "Trabalho e energia", "Prática laboratorial: medições"],
    "QUI": ["Estrutura atómica", "Tabela periódica", "Ligações químicas", "Prática laboratorial: soluções"],
    "BIO": ["A célula", "Tecidos vegetais", "Ecossistemas de Angola", "Observação ao microscópio"],
    "ING": ["Present simple vs. continuous", "Reading: Angola's provinces", "Writing an e-mail", "Listening practice"],
    "FILOS": ["O que é a filosofia", "Lógica e argumentação"],
    "TIC": ["Folha de cálculo: fórmulas", "Segurança digital"],
    "EF": ["Atletismo: velocidade", "Basquetebol: passe e drible"],
    "EMPR": ["Ideia de negócio"],
    "HIST": ["Os reinos de Angola", "A expansão europeia"],
    "GEO": ["Relevo de Angola", "Bacias hidrográficas"],
}

FIRST = {
    "female": ["Ana", "Beatriz", "Celeste", "Delfina", "Esperança", "Fátima", "Graciete", "Isabel",
               "Joana", "Luzia", "Marta", "Nádia", "Olívia", "Paula", "Rita"],
    "male": ["Adilson", "Bento", "Carlos", "Domingos", "Edson", "Feliciano", "Gaspar", "Hélder",
             "Ivan", "José", "Kelson", "Lucas", "Mário", "Nelson", "Osvaldo"],
}
LAST = ["Mbala", "Cassinda", "Tchipa", "Ngola", "Satchilombo", "Chissola", "Bunga", "Kambala", "Lussati",
        "Sakaita", "Ndombe", "Chimuco", "Cahombo", "Kalembe", "Tchiyuka"]

WEEK_MAC = dt.date(2026, 10, 12)  # semana já passada: Teste 1 (MAC) com notas lançadas
ASSESSMENT_WEEKS = [
    # período, nome, tipo, componente, segunda-feira da semana, finalidade, duração
    (1, "Teste 1", "continua", "MAC", WEEK_MAC, "formative", 45),
    (1, "Prova do professor", "prova", "NPP", dt.date(2026, 11, 16), "summative", 90),
    (1, "Prova trimestral", "prova", "NPT", dt.date(2026, 11, 30), "summative", 90),
    (2, "Prova do professor", "prova", "NPP", dt.date(2027, 2, 22), "summative", 90),
    (2, "Prova trimestral", "prova", "NPT", dt.date(2027, 3, 15), "summative", 90),
    (3, "Prova do professor", "prova", "NPP", dt.date(2027, 5, 24), "summative", 90),
    (3, "Prova trimestral", "prova", "NPT", dt.date(2027, 6, 7), "summative", 90),
]

# Trabalhos: (chave, disciplina, tipo, título, descrição, prazo). Prazo "+N" é relativo
# ao dia em que o seed corre, para continuarem «por entregar».
TASKS = {
    "10a": [
        ("t1", "FIS", "trabalho", "Relatório: medição do período de um pêndulo",
         "Relatório em grupo da prática laboratorial, com tabela de medições e conclusão.", "2026-10-20"),
        ("t2", "MAT", "tpc", "Ficha 3 — funções do 1.º grau", "Exercícios 1 a 12 da ficha distribuída na aula.", "2026-10-22"),
        ("t3", "QUI", "pesquisa", "Pesquisa: elementos químicos na indústria angolana",
         "Escolher um elemento e descrever onde é explorado ou usado em Angola (2 páginas).", "+3"),
        ("t4", "PORT", "leitura", "Leitura: «A Vida Verdadeira de Domingos Xavier»", "Ler os capítulos 1 a 3 e preparar um resumo oral.", "+5"),
        ("t5", "BIO", "projecto", "Projecto: horta escolar e ciclo das plantas",
         "Plano do projecto com calendário de observação semanal.", "+9"),
        ("t6", "ING", "tpc", "Writing: an e-mail to a pen friend", "120–150 words about your school and city.", "+4"),
    ],
    "7a": [
        ("t1", "PORT", "tpc", "Ficha de gramática — classes de palavras", "Identificar nomes, adjectivos e verbos no texto da página 24.", "2026-10-21"),
        ("t2", "HIST", "trabalho", "Cartaz: os reinos do Kongo e do Ndongo", "Trabalho em pares, em cartolina A3.", "2026-10-23"),
        ("t3", "MAT", "tpc", "Ficha 2 — números racionais", "Resolver os exercícios pares da ficha.", "+2"),
        ("t4", "GEO", "pesquisa", "Pesquisa: rios da minha província", "Mapa simples e uma página de texto.", "+6"),
        ("t5", "BIO", "trabalho", "Herbário de folhas", "Recolher e identificar 8 folhas diferentes.", "+10"),
        ("t6", "ING", "leitura", "Reading: «My family»", "Read the text and answer the five questions.", "+3"),
    ],
}

EVENTS = [
    # chave, título, descrição, categoria, início, fim, hora início, hora fim, público, bloqueia
    ("pais1", "Reunião de pais e encarregados", "Apresentação do director de turma e do plano do trimestre.",
     "meeting", "2026-10-30", "2026-10-30", "15:00", "16:30", "all", False),
    ("visita", "Visita de estudo ao Museu Nacional de História Natural", "Saída às 08:00, regresso às 12:00.",
     "event", "2026-11-06", "2026-11-06", None, None, "all", False),
    ("npp1", "Semana das provas do professor (NPP)", "Provas do 1.º trimestre em todas as disciplinas.",
     "event", "2026-11-16", "2026-11-20", None, None, "all", False),
    ("npt1", "Provas trimestrais do 1.º trimestre (NPT)", "Calendário de provas afixado na turma.",
     "event", "2026-11-30", "2026-12-04", None, None, "all", False),
    ("fim1", "Término das aulas do 1.º trimestre", "Último dia de aulas do trimestre.",
     "deadline", "2026-12-11", "2026-12-11", None, None, "all", False),
    ("cons1", "Conselho de notas do 1.º trimestre", "Professores da turma e director de turma.",
     "meeting", "2026-12-14", "2026-12-14", "08:00", "12:00", "staff", False),
    ("bol1", "Entrega dos boletins do 1.º trimestre", "Entrega aos encarregados de educação.",
     "meeting", "2026-12-17", "2026-12-17", "14:00", "17:00", "all", False),
    ("natal", "Férias de Natal e Fim de Ano", "Interrupção lectiva.",
     "closure", "2026-12-21", "2027-01-04", None, None, "all", True),
    ("ini2", "Início das aulas do 2.º trimestre", None, "event", "2027-01-05", "2027-01-05", None, None, "all", False),
    ("fim2", "Término das aulas do 2.º trimestre", None, "deadline", "2027-03-26", "2027-03-26", None, None, "all", False),
    ("pascoa", "Pausa pedagógica da Páscoa", "Interrupção lectiva.",
     "closure", "2027-03-29", "2027-04-09", None, None, "all", True),
    ("ini3", "Início das aulas do 3.º trimestre", None, "event", "2027-04-12", "2027-04-12", None, None, "all", False),
    ("fimano", "Término das aulas do ano lectivo", "Último dia de aulas de 2026/2027.",
     "deadline", "2027-06-18", "2027-06-18", None, None, "all", False),
    ("exames", "Exames finais", "Calendário por disciplina publicado em Junho.",
     "event", "2027-06-21", "2027-07-02", None, None, "all", False),
    ("recurso", "Exames de recurso", None, "event", "2027-07-12", "2027-07-16", None, None, "all", False),
]


# --------------------------------------------------------------------------------------
# Horário: distribuição gulosa determinística, no máximo 2 tempos por dia e disciplina.
# --------------------------------------------------------------------------------------

def build_grid(group: dict) -> list[tuple[int, int, str]]:
    """(dia 1–5, tempo 1–N, código) para cada aula. Falha se a carga não couber."""
    remaining = {code: n for code, n, _, _ in group["subjects"]}
    per_day = len(group["periods"])
    assert sum(remaining.values()) == per_day * 5, group["key"]
    order = [code for code, *_ in group["subjects"]]
    grid: list[tuple[int, int, str]] = []
    for day in range(1, 6):
        today: dict[str, int] = {}
        days_left = 6 - day
        previous = None
        for period in range(1, per_day + 1):
            def score(code: str):
                # Primeiro quem não cabe nos dias que restam, depois quem tem mais por dar.
                urgent = remaining[code] > 2 * (days_left - 1) + (2 - today.get(code, 0))
                return (not urgent, -remaining[code], code == previous, order.index(code))
            candidates = [c for c in order if remaining[c] > 0 and today.get(c, 0) < 2]
            if not candidates:
                raise SystemExit(f"Horário impossível para {group['key']} no dia {day}")
            pick = min(candidates, key=score)
            grid.append((day, period, pick))
            remaining[pick] -= 1
            today[pick] = today.get(pick, 0) + 1
            previous = pick
    assert all(v == 0 for v in remaining.values()), remaining
    return grid


def lesson_date(week_monday: dt.date, weekday: int) -> dt.date:
    return week_monday + dt.timedelta(days=weekday - 1)


# --------------------------------------------------------------------------------------
# SQL
# --------------------------------------------------------------------------------------

def seed_sql() -> str:
    out: list[str] = []
    w = out.append
    w("""-- =====================================================================================
-- SIGA — DEMONSTRAÇÃO DOS HORÁRIOS (DH26) · Colégio Adventista - Huambo (SIGA-AO-000001)
-- Gerado por scripts/siga/gen-demo-horarios-seed.py — não editar à mão.
--
-- Corre no SQL Editor do Supabase, como um único bloco. É seguro repetir: cada linha
-- tem id determinístico e ON CONFLICT DO NOTHING; o horário só é publicado uma vez.
-- Desfaz-se com supabase/PURGE_DEMO_HORARIOS_2026.sql.
--
-- Cria, só para as turmas DH26-10A (manhã) e DH26-7A (tarde) do ano lectivo activo:
--   · 6 salas, 7 professores fictícios (+ o professor ligado a fernandotunas6@gmail.com
--     em Inglês), 30 alunos fictícios com matrícula activa;
--   · disciplinas da turma com carga semanal, horário completo (30 e 25 tempos) e
--     publicação pela função publish_academic_schedule_atomic (validação de carga,
--     conflitos de turma/professor/sala e docentes);
--   · provas dos 3 trimestres (Teste 1 com notas, NPP e NPT), trabalhos com prazos
--     (entregues, devolvidos com nota e por entregar), calendário da turma (reuniões,
--     término das aulas, férias, exames) e as sessões de exame final e de recurso.
-- Nada fica visível às turmas reais: todos os eventos levam a turma DH26.
--
-- Para ensaiar sem gravar, mude c_dry_run para true: o bloco termina com erro e a base
-- desfaz tudo, mostrando as contagens na mensagem.
-- =====================================================================================
DO $seed$
DECLARE
  c_dry_run constant boolean := false;
  v_school uuid; v_actor uuid; v_year uuid; v_year_start date; v_year_end date;
  v_campus uuid; v_linked uuid; v_shift_morning uuid; v_shift_afternoon uuid;
  v_term1 date; v_term3_end date; v_gl uuid; v_subject uuid; v_teacher uuid;
  v_published integer := 0; v_counts text;
BEGIN""")
    w(f"""  SELECT id INTO v_school FROM public.schools WHERE public_code = {q(SCHOOL_CODE)};
  IF v_school IS NULL THEN RAISE EXCEPTION 'Escola {SCHOOL_CODE} não encontrada.'; END IF;

  -- Actor das escritas: o proprietário; senão o primeiro Administrador activo.
  SELECT m.user_id INTO v_actor FROM public.school_memberships m JOIN auth.users u ON u.id = m.user_id
   WHERE m.school_id = v_school AND m.status = 'active' AND lower(u.email) = {q(ACTOR_EMAIL)};
  IF v_actor IS NULL THEN
    SELECT m.user_id INTO v_actor FROM public.school_memberships m
      JOIN public.member_roles mr ON mr.membership_id = m.id AND mr.school_id = m.school_id
      JOIN public.roles r ON r.id = mr.role_id
     WHERE m.school_id = v_school AND m.status = 'active'
       AND r.name IN ('Administrador proprietário', 'Administrador')
     ORDER BY m.created_at LIMIT 1;
  END IF;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sem Administrador activo para assinar as escritas.'; END IF;

  SELECT id, starts_on, ends_on INTO v_year, v_year_start, v_year_end FROM public.academic_years
   WHERE school_id = v_school AND status = 'active' ORDER BY starts_on DESC LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'A escola não tem ano lectivo activo.'; END IF;
  IF v_year_start > DATE '2026-10-12' OR v_year_end < DATE '2027-07-16' THEN
    RAISE EXCEPTION 'O ano lectivo activo (% a %) não cobre as datas da demonstração.', v_year_start, v_year_end;
  END IF;
  IF (SELECT count(DISTINCT sequence) FROM public.terms
       WHERE school_id = v_school AND academic_year_id = v_year AND sequence IN (1, 2, 3)) < 3 THEN
    RAISE EXCEPTION 'Configure os três trimestres do ano lectivo activo antes da demonstração.';
  END IF;

  SELECT id INTO v_campus FROM public.campuses WHERE school_id = v_school ORDER BY created_at LIMIT 1;
  SELECT id INTO v_shift_morning FROM public.school_shifts WHERE school_id = v_school AND code = 'morning' AND status = 'active';
  SELECT id INTO v_shift_afternoon FROM public.school_shifts WHERE school_id = v_school AND code = 'afternoon' AND status = 'active';

  SELECT t.id INTO v_linked FROM public.teachers t JOIN auth.users u ON u.id = t.user_id
   WHERE t.school_id = v_school AND t.status = 'active' AND lower(u.email) = {q(LINKED_TEACHER_EMAIL)} LIMIT 1;
""")

    # Salas
    w("  -- Salas ----------------------------------------------------------------------------")
    for key, code, name, kind, cap in ROOMS:
        rid = did(f"room:{key}", "rooms")
        w(f"""  INSERT INTO public.rooms (id, school_id, code, name, capacity, status, room_type, campus_id, building, notes, created_by, updated_by)
  VALUES ({q(rid)}, v_school, {q(code)}, {q(name)}, {cap}, 'active', {q(kind)}, v_campus, 'Bloco D', 'Demonstração SIGA (DH26)', v_actor, v_actor)
  ON CONFLICT (id) DO NOTHING;""")

    # Professores
    w("  -- Professores fictícios --------------------------------------------------------------")
    for n, (key, name, sex, mail, phone, qual, kind) in enumerate(TEACHERS, start=1):
        pid = did(f"teacher-person:{key}", "people")
        tid = did(f"teacher:{key}", "teachers")
        w(f"""  INSERT INTO public.people (id, school_id, full_name, sex, email, phone, status, created_by, updated_by)
  VALUES ({q(pid)}, v_school, {q(name)}, {q(sex)}, {q(mail + '@demo.siga-plus.invalid')}, {q(phone)}, 'active', v_actor, v_actor)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.teachers (id, school_id, person_id, employee_number, hired_on, employment_type, highest_qualification, status, created_by, updated_by)
  VALUES ({q(tid)}, v_school, {q(pid)}, {q(f'DOC-99{n:04d}')}, DATE '2024-02-01', {q(kind)}, {q(qual)}, 'active', v_actor, v_actor)
  ON CONFLICT (id) DO NOTHING;""")
    w(f"  IF v_linked IS NULL THEN v_linked := {q(did('teacher:ing'))}; END IF;")

    rooms = {key: (did(f"room:{key}"), name) for key, _, name, _, _ in ROOMS}

    for g in GROUPS:
        gk = g["key"]
        gid = did(f"group:{gk}", "class_groups")
        prog, gcode, gseq = g["grade"]
        shift_var = "v_shift_morning" if g["shift"] == "morning" else "v_shift_afternoon"
        w(f"  -- Turma {g['code']} ---------------------------------------------------------------")
        w(f"""  SELECT gl.id INTO v_gl FROM public.grade_levels gl JOIN public.programs p ON p.id = gl.program_id
   WHERE gl.school_id = v_school AND gl.is_active AND p.code = {q(prog)} AND gl.code = {q(gcode)} LIMIT 1;
  IF v_gl IS NULL THEN
    SELECT id INTO v_gl FROM public.grade_levels WHERE school_id = v_school AND is_active AND sequence = {gseq} ORDER BY created_at LIMIT 1;
  END IF;
  IF v_gl IS NULL THEN RAISE EXCEPTION 'Sem classe {gseq} activa para a turma {g['code']}.'; END IF;
  INSERT INTO public.class_groups (id, school_id, academic_year_id, campus_id, grade_level_id, homeroom_teacher_id, code, name, shift, capacity, status, room_id, created_by, updated_by)
  VALUES ({q(gid)}, v_school, v_year, v_campus, v_gl, {q(did('teacher:' + g['director']))}, {q(g['code'])}, {q(g['name'])}, {q(g['shift'])}, 35, 'active', {q(rooms[g['home']][0])}, v_actor, v_actor)
  ON CONFLICT (id) DO NOTHING;""")

        # Alunos: 15 por turma, metade raparigas.
        enrollments = []
        base = 1269000 if gk == "10a" else 1269100
        birth_year = 2010 if gk == "10a" else 2013
        for i in range(15):
            sex = "female" if i % 2 == 0 else "male"
            first = FIRST[sex][(i * 7 + (0 if gk == "10a" else 3)) % 15]
            last = f"{LAST[(i * 4 + 1) % 15]} {LAST[(i * 11 + (2 if gk == '10a' else 5)) % 15]}"
            pid = did(f"student-person:{gk}:{i}", "people")
            sid = did(f"student:{gk}:{i}", "students")
            eid = did(f"enrollment:{gk}:{i}", "enrollments")
            enrollments.append(eid)
            number = base + i + 1
            born = dt.date(birth_year, 1 + (i * 5) % 12, 1 + (i * 3) % 27)
            w(f"""  INSERT INTO public.people (id, school_id, full_name, sex, date_of_birth, status, created_by, updated_by)
  VALUES ({q(pid)}, v_school, {q(first + ' ' + last)}, {q(sex)}, DATE {q(born.isoformat())}, 'active', v_actor, v_actor) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id, school_id, person_id, student_number, admission_date, status, created_by, updated_by)
  VALUES ({q(sid)}, v_school, {q(pid)}, {q(str(number))}, DATE '2026-09-01', 'active', v_actor, v_actor) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.enrollments (id, school_id, academic_year_id, class_group_id, student_id, enrollment_number, enrolled_on, status, created_by, updated_by)
  VALUES ({q(eid)}, v_school, v_year, {q(gid)}, {q(sid)}, {q(str(number))}, DATE '2026-09-01', 'active', v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")
        w(f"  UPDATE public.class_groups SET delegate_student_id = {q(did(f'student:{gk}:4'))}, updated_by = v_actor WHERE id = {q(gid)} AND delegate_student_id IS NULL;")

        # Disciplinas da turma
        cs_ids = {}
        for code, periods, teacher, _room in g["subjects"]:
            csid = did(f"class-subject:{gk}:{code}", "class_subjects")
            cs_ids[code] = csid
            teacher_sql = "v_linked" if teacher == "linked" else q(did(f"teacher:{teacher}"))
            w(f"""  SELECT id INTO v_subject FROM public.subjects WHERE school_id = v_school AND code = {q(code)} AND status = 'active';
  IF v_subject IS NULL THEN RAISE EXCEPTION 'Disciplina {code} ({SUBJECT_NAMES[code]}) não existe ou não está activa na escola.'; END IF;
  INSERT INTO public.class_subjects (id, school_id, class_group_id, subject_id, teacher_id, weekly_periods, status, created_by, updated_by)
  VALUES ({q(csid)}, v_school, {q(gid)}, v_subject, {teacher_sql}, {periods}, 'active', v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")

        # Horário
        grid = build_grid(g)
        g["grid"] = grid
        room_of = {code: room for code, _, _, room in g["subjects"]}
        topic_index: dict[str, int] = {}
        for day, period, code in grid:
            start, end = g["periods"][period - 1]
            slot = did(f"slot:{gk}:{day}:{period}", "timetable_slots")
            room_id, room_name = rooms[room_of[code]]
            w(f"""  INSERT INTO public.timetable_slots (id, school_id, class_subject_id, weekday, starts_at, ends_at, room, room_id, shift_id, day_period_number, status, created_by, updated_by)
  VALUES ({q(slot)}, v_school, {q(cs_ids[code])}, {day}, TIME {q(start)}, TIME {q(end)}, {q(room_name)}, {q(room_id)}, {shift_var}, {period}, 'active', v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")
            n = topic_index.get(code, 0)
            topic_index[code] = n + 1
            topics = TOPICS[code]
            lesson_type = "laboratorio" if room_of[code] in ("labq", "labf") and n % 2 else "pratica" if code in ("EF", "TIC") else "teorica"
            w(f"""  INSERT INTO public.siga_timetable_slot_details (id, school_id, timetable_slot_id, lesson_type, delivery_mode, topic, created_by, updated_by)
  VALUES ({q(did(f'slot-detail:{gk}:{day}:{period}', 'siga_timetable_slot_details'))}, v_school, {q(slot)}, {q(lesson_type)}, 'presencial', {q(topics[n % len(topics)])}, v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")

        # Publicação pelo mesmo caminho da aplicação.
        w(f"""  IF NOT EXISTS (SELECT 1 FROM public.academic_schedules WHERE school_id = v_school AND class_group_id = {q(gid)} AND status = 'published') THEN
    PERFORM public.publish_academic_schedule_atomic(v_school, {q(gid)}, v_year, v_actor, NULL, NULL, {q('Horário ' + g['code'] + ' · 2026/2027')});
    v_published := v_published + 1;
  END IF;""")

        # Provas: cada uma no primeiro tempo da disciplina na semana indicada.
        first_slot = {}
        for day, period, code in grid:
            first_slot.setdefault(code, (day, period))
        holidays = {dt.date(2026, 11, 2), dt.date(2026, 11, 11), dt.date(2026, 12, 25)}
        for term, label, kind, component, monday, purpose, minutes in ASSESSMENT_WEEKS:
            for code, *_ in g["subjects"]:
                day, period = first_slot[code]
                date = lesson_date(monday, day)
                assert date not in holidays, (code, date)
                start, _ = g["periods"][period - 1]
                if kind == "prova" and minutes > 45:
                    duration = 90 if period < len(g["periods"]) else 45
                else:
                    duration = minutes
                item = did(f"assessment:{gk}:{code}:{term}:{component}", "siga_assessment_items")
                w(f"""  SELECT subject_id INTO v_subject FROM public.class_subjects WHERE id = {q(cs_ids[code])};
  INSERT INTO public.siga_assessment_items (id, school_id, class_group_id, subject_id, term, name, kind, component, assessed_on, max_score, counts_toward_pauta, allow_recovery, description, starts_at, duration_minutes, purpose, created_by, updated_by)
  VALUES ({q(item)}, v_school, {q(gid)}, v_subject, {term}, {q(f'{label} · {SUBJECT_NAMES[code]}')}, {q(kind)}, {q(component)}, DATE {q(date.isoformat())}, 20, true, {q(component == 'NPT')}, {q(f'{term}.º trimestre — {label.lower()} ({component}).')}, TIME {q(start)}, {duration}, {q(purpose)}, v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")
                if monday == WEEK_MAC:
                    for i, eid in enumerate(enrollments):
                        score = 8 + (i * 7 + len(code) * 3 + term) % 12  # 8–19
                        w(f"  INSERT INTO public.siga_assessment_scores (id, school_id, item_id, enrollment_id, score, status, recorded_by) VALUES ({q(did(f'score:{gk}:{code}:{i}', 'siga_assessment_scores'))}, v_school, {q(item)}, {q(eid)}, {score}, 'draft', v_actor) ON CONFLICT (id) DO NOTHING;")

        # Trabalhos e entregas.
        for tkey, code, kind, title, desc, due in TASKS[gk]:
            tid = did(f"task:{gk}:{tkey}", "siga_class_tasks")
            due_sql = f"current_date + {int(due[1:])}" if due.startswith("+") else f"DATE {q(due)}"
            w(f"""  INSERT INTO public.siga_class_tasks (id, school_id, class_subject_id, kind, title, description, due_on, status, created_by, updated_by)
  VALUES ({q(tid)}, v_school, {q(cs_ids[code])}, {q(kind)}, {q(title)}, {q(desc)}, {due_sql}, 'published', v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")
            past = not due.startswith("+")
            for i, eid in enumerate(enrollments):
                if past:
                    # Prazo passado: 12 entregaram (2 atrasados), 3 não; 8 já devolvidos com nota.
                    if i >= 12:
                        continue
                    late = i in (10, 11)
                    returned = i < 8
                    grade = 10 + (i * 3 + len(title)) % 10
                    submitted = f"(DATE {q(due)} - {1 if not late else -1}) + TIME '18:30'"
                    w(f"""  INSERT INTO public.siga_class_task_submissions (id, school_id, task_id, enrollment_id, attempt, status, body, on_paper, submitted_at, is_late, grade, feedback, graded_by, returned_at, created_by, updated_by)
  VALUES ({q(did(f'submission:{gk}:{tkey}:{i}', 'siga_class_task_submissions'))}, v_school, {q(tid)}, {q(eid)}, 1, {q('returned' if returned else 'submitted')}, {q(None if i % 3 == 0 else 'Entrega do trabalho em anexo ao caderno.')}, {q(i % 3 == 0)}, {submitted}, {q(late)}, {grade if returned else 'NULL'}, {q('Bom trabalho; reveja a conclusão.' if returned else None)}, {'v_actor' if returned else 'NULL'}, {f"DATE {q(due)} + 3 + TIME '10:00'" if returned else 'NULL'}, v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")
                elif i < 4:
                    # Prazo futuro: só 4 já entregaram; os restantes estão por entregar.
                    w(f"""  INSERT INTO public.siga_class_task_submissions (id, school_id, task_id, enrollment_id, attempt, status, body, submitted_at, is_late, created_by, updated_by)
  VALUES ({q(did(f'submission:{gk}:{tkey}:{i}', 'siga_class_task_submissions'))}, v_school, {q(tid)}, {q(eid)}, 1, 'submitted', 'Entrega antecipada.', now() - interval '{i + 1} hours', false, v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")

        # Calendário, preso à turma.
        for ekey, title, desc, cat, start, end, t0, t1, audience, blocks in EVENTS:
            if ekey == "visita" and gk != "7a":
                continue
            eid = did(f"event:{gk}:{ekey}", "siga_calendar_events")
            w(f"""  INSERT INTO public.siga_calendar_events (id, school_id, academic_year_id, class_group_id, title, description, category, starts_on, ends_on, starts_at, ends_at, audience, blocks_teaching, status, created_by, updated_by)
  VALUES ({q(eid)}, v_school, v_year, {q(gid)}, {q(title)}, {q(desc or '')}, {q(cat)}, DATE {q(start)}, DATE {q(end)}, {('TIME ' + q(t0)) if t0 else 'NULL'}, {('TIME ' + q(t1)) if t1 else 'NULL'}, {q(audience)}, {q(blocks)}, 'published', v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")

    # Sessões de exame do ano.
    w("  -- Sessões de exame -----------------------------------------------------------------")
    for key, kind, name, start, end, method in (
        ("final", "exame_final", "Exames finais 2026/2027 (demonstração)", "2027-06-21", "2027-07-02", "average"),
        ("recurso", "recurso", "Exames de recurso 2026/2027 (demonstração)", "2027-07-12", "2027-07-16", "replace"),
    ):
        w(f"""  INSERT INTO public.siga_exam_sessions (id, school_id, academic_year_id, kind, name, starts_on, ends_on, max_failed_subjects, result_method, status, created_by, updated_by)
  VALUES ({q(did(f'exam-session:{key}', 'siga_exam_sessions'))}, v_school, v_year, {q(kind)}, {q(name)}, DATE {q(start)}, DATE {q(end)}, 3, {q(method)}, 'draft', v_actor, v_actor) ON CONFLICT (id) DO NOTHING;""")

    groups_sql = ", ".join(q(did(f"group:{g['key']}")) for g in GROUPS)
    w(f"""
  SELECT format('salas=%s professores=%s turmas=%s alunos=%s disciplinas=%s aulas=%s horários publicados=%s (novos nesta corrida=%s) provas=%s notas=%s trabalhos=%s entregas=%s eventos=%s',
    (SELECT count(*) FROM public.rooms WHERE school_id = v_school AND code LIKE 'DH26-%'),
    (SELECT count(DISTINCT cs.teacher_id) FROM public.class_subjects cs WHERE cs.class_group_id IN ({groups_sql})),
    (SELECT count(*) FROM public.class_groups WHERE id IN ({groups_sql})),
    (SELECT count(*) FROM public.enrollments WHERE class_group_id IN ({groups_sql}) AND status = 'active'),
    (SELECT count(*) FROM public.class_subjects WHERE class_group_id IN ({groups_sql})),
    (SELECT count(*) FROM public.timetable_slots t JOIN public.class_subjects cs ON cs.id = t.class_subject_id WHERE cs.class_group_id IN ({groups_sql}) AND t.status = 'active' AND t.schedule_id IS NOT NULL),
    (SELECT count(*) FROM public.academic_schedules WHERE class_group_id IN ({groups_sql}) AND status = 'published'),
    v_published,
    (SELECT count(*) FROM public.siga_assessment_items WHERE class_group_id IN ({groups_sql})),
    (SELECT count(*) FROM public.siga_assessment_scores s JOIN public.siga_assessment_items i ON i.id = s.item_id WHERE i.class_group_id IN ({groups_sql})),
    (SELECT count(*) FROM public.siga_class_tasks t JOIN public.class_subjects cs ON cs.id = t.class_subject_id WHERE cs.class_group_id IN ({groups_sql})),
    (SELECT count(*) FROM public.siga_class_task_submissions s JOIN public.siga_class_tasks t ON t.id = s.task_id JOIN public.class_subjects cs ON cs.id = t.class_subject_id WHERE cs.class_group_id IN ({groups_sql})),
    (SELECT count(*) FROM public.siga_calendar_events WHERE class_group_id IN ({groups_sql}))
  ) INTO v_counts;
  IF c_dry_run THEN
    RAISE EXCEPTION 'ENSAIO OK (nada gravado): %', v_counts;
  END IF;
  RAISE NOTICE 'Demonstração DH26 pronta: %', v_counts;
END
$seed$;
""")
    return "\n".join(out)


def purge_sql() -> str:
    groups = [did(f"group:{g['key']}") for g in GROUPS]
    groups_sql = ", ".join(q(x) for x in groups)
    by_table: dict[str, list[str]] = {}
    for table, value in created:
        by_table.setdefault(table, []).append(value)

    def ids(table: str) -> str:
        return ", ".join(q(x) for x in dict.fromkeys(by_table.get(table, [])))

    return f"""-- =====================================================================================
-- SIGA — DESFAZER A DEMONSTRAÇÃO DOS HORÁRIOS (DH26)
-- Gerado por scripts/siga/gen-demo-horarios-seed.py — não editar à mão.
--
-- Apaga só o que SEED_DEMO_HORARIOS_2026.sql criou (ids determinísticos) e o que a
-- aplicação gerou depois sobre as turmas DH26 (versões do horário, sessões de presença,
-- notas, entregas). Recusa correr se alguma turma DH26 tiver alunos que não sejam os
-- da demonstração. O professor real ligado ao Inglês fica intacto; só perde as aulas DH26.
-- =====================================================================================
DO $purge$
DECLARE
  v_groups uuid[] := ARRAY[{groups_sql}]::uuid[];
  v_students uuid[] := ARRAY[{ids('students') or 'NULL'}]::uuid[];
  v_people uuid[] := ARRAY[{ids('people') or 'NULL'}]::uuid[];
  v_n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_group_id = ANY (v_groups) AND NOT e.student_id = ANY (v_students)) THEN
    RAISE EXCEPTION 'Há matrículas reais nas turmas DH26; mova-as antes de limpar a demonstração.';
  END IF;

  DELETE FROM public.siga_class_task_submissions s USING public.siga_class_tasks t, public.class_subjects cs
   WHERE s.task_id = t.id AND t.class_subject_id = cs.id AND cs.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_class_tasks t USING public.class_subjects cs WHERE t.class_subject_id = cs.id AND cs.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_assessment_scores s USING public.siga_assessment_items i WHERE s.item_id = i.id AND i.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_assessment_items WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.siga_attendance_records r USING public.siga_attendance_sessions a WHERE r.session_id = a.id AND a.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_lesson_meetings m USING public.siga_attendance_sessions a WHERE m.attendance_session_id = a.id AND a.class_group_id = ANY (v_groups);
  DELETE FROM public.siga_attendance_sessions WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.siga_calendar_events WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.siga_timetable_slot_details d USING public.timetable_slots t, public.class_subjects cs
   WHERE d.timetable_slot_id = t.id AND t.class_subject_id = cs.id AND cs.class_group_id = ANY (v_groups);
  DELETE FROM public.timetable_slots t USING public.class_subjects cs WHERE t.class_subject_id = cs.id AND cs.class_group_id = ANY (v_groups);
  DELETE FROM public.academic_schedules WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.class_subjects WHERE class_group_id = ANY (v_groups);
  UPDATE public.class_groups SET delegate_student_id = NULL, homeroom_teacher_id = NULL WHERE id = ANY (v_groups);
  DELETE FROM public.enrollments WHERE class_group_id = ANY (v_groups);
  DELETE FROM public.class_groups WHERE id = ANY (v_groups);
  DELETE FROM public.students WHERE id = ANY (v_students);
  DELETE FROM public.siga_exam_sessions WHERE id IN ({ids('siga_exam_sessions')});
  DELETE FROM public.teachers WHERE id IN ({ids('teachers')});
  DELETE FROM public.rooms WHERE id IN ({ids('rooms')});
  DELETE FROM public.people WHERE id = ANY (v_people);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Demonstração DH26 removida (% pessoas).', v_n;
END
$purge$;
"""


def main() -> None:
    seed = seed_sql()  # preenche `created`
    SEED.write_text(seed, encoding="utf-8")
    PURGE.write_text(purge_sql(), encoding="utf-8")
    for g in GROUPS:
        days = {d: [c for dd, _, c in sorted(g["grid"]) if dd == d] for d in range(1, 6)}
        print(g["code"], {d: " ".join(v) for d, v in days.items()})
    print(f"{SEED.relative_to(ROOT)}: {len(seed.splitlines())} linhas; {len(created)} linhas criadas")


if __name__ == "__main__":
    main()
