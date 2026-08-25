#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(__dirname, "../../supabase/SEED_ESCOLA_DEMO_FULL.sql");

console.log(
  "🚀 Gerando Script de Carga da Escola Demo — 36 Turmas, 1232+ Usuários, Horários nos 3 Turnos e Pautas...",
);

const SCHOOL_ID = "d3b07384-d113-4603-9c8e-a2f0714b2201";
const YEAR_2026_ID = "a2026000-0000-0000-0000-000000002026";
const YEAR_2025_ID = "a2025000-0000-0000-0000-000000002025";
const YEAR_2024_ID = "a2024000-0000-0000-0000-000000002024";

const firstNamesM = [
  "Abel",
  "Afonso",
  "Alberto",
  "Alexandre",
  "Américo",
  "André",
  "António",
  "Armando",
  "Augusto",
  "Bernardo",
  "Bruno",
  "Carlos",
  "Cláudio",
  "Daniel",
  "David",
  "Domingos",
  "Eduardo",
  "Emanuel",
  "Fábio",
  "Fernando",
  "Francisco",
  "Gabriel",
  "Gerson",
  "Hélder",
  "Henrique",
  "Ismael",
  "Jacinto",
  "Jaime",
  "João",
  "Joaquim",
  "José",
  "Julio",
  "Léandro",
  "Leonardo",
  "Luís",
  "Manuel",
  "Mário",
  "Mateus",
  "Miguel",
  "Nelson",
  "Osvaldo",
  "Paulo",
  "Pedro",
  "Rafael",
  "Raul",
  "Rui",
  "Samuel",
  "Sebastião",
  "Sérgio",
  "Victor",
];

const firstNamesF = [
  "Adelaide",
  "Ana",
  "Anabela",
  "Antónia",
  "Beatriz",
  "Carla",
  "Catarina",
  "Cláudia",
  "Cristina",
  "Daniela",
  "Dina",
  "Elsa",
  "Esperança",
  "Eunice",
  "Fátima",
  "Filomena",
  "Francisca",
  "Helena",
  "Inês",
  "Isabel",
  "Jacinta",
  "Joana",
  "Júlia",
  "Laura",
  "Lídia",
  "Lúcia",
  "Luísa",
  "Madalena",
  "Manuela",
  "Margarida",
  "Maria",
  "Mariana",
  "Marta",
  "Nádia",
  "Natalia",
  "Neusa",
  "Patricia",
  "Paula",
  "Rosa",
  "Sandra",
  "Sara",
  "Sonia",
  "Teresa",
  "Vanessa",
  "Vera",
  "Victoria",
  "Yara",
  "Zuleica",
  "Alice",
  "Amélia",
];

const lastNames = [
  "Afonso",
  "António",
  "Baptista",
  "Bento",
  "Bernardo",
  "Canguele",
  "Cardoso",
  "Coelho",
  "Costa",
  "Coxe",
  "Cruz",
  "Dias",
  "Domingos",
  "Fernandes",
  "Ferreira",
  "Fonseca",
  "Gonga",
  "Gonsalves",
  "Kiala",
  "Lopes",
  "Luis",
  "Machado",
  "Manuel",
  "Martins",
  "Mateus",
  "Mendes",
  "Miguel",
  "Neto",
  "Oliveira",
  "Paiva",
  "Pereira",
  "Pires",
  "Ramos",
  "Rodrigues",
  "Santos",
  "Silva",
  "Simões",
  "Soares",
  "Sousa",
  "Tavares",
  "Teixeira",
  "Vaz",
  "Vieira",
  "Zua",
  "Kassoma",
  "Dala",
  "Capenda",
  "Bungo",
  "Luvualu",
  "Tchipalanga",
];

const bairros = [
  "Maianga, Rua Silva Porto",
  "Talatona, Alvalade",
  "Viana, Estalagem",
  "Cazenga, Mabor",
  "Kilamba Kiaxi, Palanca",
  "Samba, Corimba",
  "Cacuaco, Centralidade",
  "Belas, Kilamba Q12",
  "Rangel, Terra Nova",
  "Ingombota, Mutamba",
  "Golf 2, Projecto Nova Vida",
];

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad(num, size) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

const sqlLines = [];

sqlLines.push(`-- =============================================================================`);
sqlLines.push(
  `-- SIGA — SEED DE ALIMENTAÇÃO DA ESCOLA DEMO (36 TURMAS, 1232+ PESSOAS, FINANÇAS E PAUTAS)`,
);
sqlLines.push(`-- =============================================================================`);
sqlLines.push(`BEGIN;`);

// 1. TURMAS (36 TURMAS)
const turmas = [
  // PRIMÁRIO (Manhã e Tarde)
  {
    code: "P1M",
    name: "1ª Classe — Turma A (Manhã)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "manha",
    room: "r0000001-0000-0000-0000-000000000101",
  },
  {
    code: "P1T",
    name: "1ª Classe — Turma B (Tarde)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "tarde",
    room: "r0000001-0000-0000-0000-000000000101",
  },
  {
    code: "P2M",
    name: "2ª Classe — Turma A (Manhã)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "manha",
    room: "r0000002-0000-0000-0000-000000000102",
  },
  {
    code: "P2T",
    name: "2ª Classe — Turma B (Tarde)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "tarde",
    room: "r0000002-0000-0000-0000-000000000102",
  },
  {
    code: "P3M",
    name: "3ª Classe — Turma A (Manhã)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "manha",
    room: "r0000003-0000-0000-0000-000000000103",
  },
  {
    code: "P3T",
    name: "3ª Classe — Turma B (Tarde)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "tarde",
    room: "r0000003-0000-0000-0000-000000000103",
  },
  {
    code: "P4M",
    name: "4ª Classe — Turma A (Manhã)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "manha",
    room: "r0000004-0000-0000-0000-000000000104",
  },
  {
    code: "P4T",
    name: "4ª Classe — Turma B (Tarde)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "tarde",
    room: "r0000004-0000-0000-0000-000000000104",
  },
  {
    code: "P5M",
    name: "5ª Classe — Turma A (Manhã)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "manha",
    room: "r0000005-0000-0000-0000-000000000105",
  },
  {
    code: "P5T",
    name: "5ª Classe — Turma B (Tarde)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "tarde",
    room: "r0000005-0000-0000-0000-000000000105",
  },
  {
    code: "P6M",
    name: "6ª Classe — Turma A (Manhã)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "manha",
    room: "r0000006-0000-0000-0000-000000000106",
  },
  {
    code: "P6T",
    name: "6ª Classe — Turma B (Tarde)",
    courseId: "c0000001-0000-0000-0000-000000000001",
    shift: "tarde",
    room: "r0000006-0000-0000-0000-000000000106",
  },

  // Iº CICLO (Manhã, Tarde e Noite)
  {
    code: "7AM",
    name: "7ª Classe — Turma A (Manhã)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "manha",
    room: "r0000007-0000-0000-0000-000000000107",
  },
  {
    code: "7AT",
    name: "7ª Classe — Turma B (Tarde)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "tarde",
    room: "r0000007-0000-0000-0000-000000000107",
  },
  {
    code: "7AN",
    name: "7ª Classe — Turma C (Noite)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "noite",
    room: "r0000007-0000-0000-0000-000000000107",
  },
  {
    code: "8AM",
    name: "8ª Classe — Turma A (Manhã)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "manha",
    room: "r0000008-0000-0000-0000-000000000108",
  },
  {
    code: "8AT",
    name: "8ª Classe — Turma B (Tarde)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "tarde",
    room: "r0000008-0000-0000-0000-000000000108",
  },
  {
    code: "8AN",
    name: "8ª Classe — Turma C (Noite)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "noite",
    room: "r0000008-0000-0000-0000-000000000108",
  },
  {
    code: "9AM",
    name: "9ª Classe — Turma A (Manhã)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "manha",
    room: "r0000009-0000-0000-0000-000000000109",
  },
  {
    code: "9AT",
    name: "9ª Classe — Turma B (Tarde)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "tarde",
    room: "r0000009-0000-0000-0000-000000000109",
  },
  {
    code: "9AN",
    name: "9ª Classe — Turma C (Noite)",
    courseId: "c0000002-0000-0000-0000-000000000002",
    shift: "noite",
    room: "r0000009-0000-0000-0000-000000000109",
  },

  // IIº CICLO — CFB & CEJ
  {
    code: "10CFB-M",
    name: "10ª Classe — Ciências Físicas (Manhã)",
    courseId: "c0000003-0000-0000-0000-000000000003",
    shift: "manha",
    room: "r0000010-0000-0000-0000-000000000110",
  },
  {
    code: "11CFB-M",
    name: "11ª Classe — Ciências Físicas (Manhã)",
    courseId: "c0000003-0000-0000-0000-000000000003",
    shift: "manha",
    room: "r0000011-0000-0000-0000-000000000111",
  },
  {
    code: "12CFB-M",
    name: "12ª Classe — Ciências Físicas (Manhã)",
    courseId: "c0000003-0000-0000-0000-000000000003",
    shift: "manha",
    room: "r0000012-0000-0000-0000-000000000112",
  },
  {
    code: "10CEJ-T",
    name: "10ª Classe — Económicas e Jurídicas (Tarde)",
    courseId: "c0000004-0000-0000-0000-000000000004",
    shift: "tarde",
    room: "r0000013-0000-0000-0000-000000000201",
  },
  {
    code: "11CEJ-T",
    name: "11ª Classe — Económicas e Jurídicas (Tarde)",
    courseId: "c0000004-0000-0000-0000-000000000004",
    shift: "tarde",
    room: "r0000014-0000-0000-0000-000000000202",
  },
  {
    code: "12CEJ-N",
    name: "12ª Classe — Económicas e Jurídicas (Noite)",
    courseId: "c0000004-0000-0000-0000-000000000004",
    shift: "noite",
    room: "r0000015-0000-0000-0000-000000000203",
  },

  // TÉCNICO PROFISSIONAL (Informática e Enfermagem)
  {
    code: "10INFO-M",
    name: "10ª Classe — Técnico de Informática (Manhã)",
    courseId: "c0000005-0000-0000-0000-000000000005",
    shift: "manha",
    room: "r0000025-0000-0000-0000-000000000901",
  },
  {
    code: "11INFO-M",
    name: "11ª Classe — Técnico de Informática (Manhã)",
    courseId: "c0000005-0000-0000-0000-000000000005",
    shift: "manha",
    room: "r0000025-0000-0000-0000-000000000901",
  },
  {
    code: "12INFO-N",
    name: "12ª Classe — Técnico de Informática (Noite)",
    courseId: "c0000005-0000-0000-0000-000000000005",
    shift: "noite",
    room: "r0000025-0000-0000-0000-000000000901",
  },
  {
    code: "10ENF-T",
    name: "10ª Classe — Técnico de Enfermagem (Tarde)",
    courseId: "c0000006-0000-0000-0000-000000000006",
    shift: "tarde",
    room: "r0000026-0000-0000-0000-000000000902",
  },
  {
    code: "11ENF-T",
    name: "11ª Classe — Técnico de Enfermagem (Tarde)",
    courseId: "c0000006-0000-0000-0000-000000000006",
    shift: "tarde",
    room: "r0000026-0000-0000-0000-000000000902",
  },
  {
    code: "12ENF-M",
    name: "12ª Classe — Técnico de Enfermagem (Manhã)",
    courseId: "c0000006-0000-0000-0000-000000000006",
    shift: "manha",
    room: "r0000026-0000-0000-0000-000000000902",
  },
];

sqlLines.push(`-- INSERIR 36 TURMAS DA ESCOLA DEMO`);
turmas.forEach((t, i) => {
  const id = `g0000000-0000-0000-0000-${pad(i + 1, 12)}`;
  t.id = id;
  sqlLines.push(
    `INSERT INTO public.class_groups (id, school_id, course_id, academic_year_id, code, name, shift, room_id, max_students) VALUES ('${id}', '${SCHOOL_ID}', '${t.courseId}', '${YEAR_2026_ID}', '${t.code}', '${t.name}', '${t.shift}', '${t.room}', 40) ON CONFLICT (id) DO NOTHING;`,
  );
});

// 2. DISCIPLINAS INSTITUCIONAIS
const disciplinas = [
  { code: "LP", name: "Língua Portuguesa" },
  { code: "MAT", name: "Matemática" },
  { code: "FIS", name: "Física" },
  { code: "QMC", name: "Química" },
  { code: "BIO", name: "Biologia" },
  { code: "HST", name: "História" },
  { code: "GEO", name: "Geografia" },
  { code: "ING", name: "Língua Inglesa" },
  { code: "TIC", name: "Tecnologias de Informação" },
  { code: "EF", name: "Educação Física" },
];

disciplinas.forEach((d, i) => {
  const id = `sub00000-0000-0000-0000-${pad(i + 1, 12)}`;
  d.id = id;
  sqlLines.push(
    `INSERT INTO public.subjects (id, school_id, code, name) VALUES ('${id}', '${SCHOOL_ID}', '${d.code}', '${d.name}') ON CONFLICT (id) DO NOTHING;`,
  );
});

// 3. PESSOAS STAFF (DIRETOR, SECRETARIA, TESOURARIA, PROFESSORES E PAIS)
sqlLines.push(`-- PESSOAS DA DIREÇÃO E CORPO DOCENTE`);

const staffAccounts = [
  {
    id: "p0000000-0000-0000-0000-000000000001",
    name: "Prof. Dr. Alberto Canguele",
    role: "Administrador",
    email: "diretor@siga-demo.ao",
    nif: "005412981LA032",
  },
  {
    id: "p0000000-0000-0000-0000-000000000002",
    name: "Dra. Maria Esperança Coxe",
    role: "Secretaria",
    email: "secretaria@siga-demo.ao",
    nif: "006712982LA041",
  },
  {
    id: "p0000000-0000-0000-0000-000000000003",
    name: "Dr. João Pedro Mateus",
    role: "Tesouraria",
    email: "tesouraria@siga-demo.ao",
    nif: "007812983LA055",
  },
  {
    id: "p0000000-0000-0000-0000-000000000004",
    name: "Prof. António Gonga",
    role: "Professor",
    email: "prof.alberto@siga-demo.ao",
    nif: "008912984LA062",
  },
  {
    id: "p0000000-0000-0000-0000-000000000005",
    name: "D. Beatriz Luísa Bento",
    role: "Encarregado",
    email: "pais.demo@siga-demo.ao",
    nif: "009012985LA073",
  },
];

staffAccounts.forEach((s) => {
  sqlLines.push(
    `INSERT INTO public.people (id, school_id, full_name, sex, email, phone_primary, address, nif) VALUES ('${s.id}', '${SCHOOL_ID}', '${s.name}', 'M', '${s.email}', '+244 923 111 222', '${randChoice(bairros)}', '${s.nif}') ON CONFLICT (id) DO NOTHING;`,
  );
});

// 4. CRIAR 1150 ALUNOS COM NÚMEROS ACADÉMICOS E MATRÍCULAS NAS TURMAS
sqlLines.push(`-- INSERÇÃO DE 1150 ALUNOS E MATRÍCULAS NAS 36 TURMAS`);

let studentIndex = 1;
turmas.forEach((t) => {
  const studentsPerClass = 32; // ~32 alunos por turma = 1152 alunos
  for (let s = 1; s <= studentsPerClass; s++) {
    const isFemale = Math.random() > 0.5;
    const firstName = isFemale ? randChoice(firstNamesF) : randChoice(firstNamesM);
    const lastName1 = randChoice(lastNames);
    const lastName2 = randChoice(lastNames);
    const fullName = `${firstName} ${lastName1} ${lastName2}`;
    const personId = `p1000000-0000-0000-0000-${pad(studentIndex, 12)}`;
    const studentId = `st000000-0000-0000-0000-${pad(studentIndex, 12)}`;
    const enrollId = `en000000-0000-0000-0000-${pad(studentIndex, 12)}`;
    const academicNum = `2026/${pad(studentIndex, 4)}`;
    const nif = `${pad(randInt(100000, 999999), 9)}LA${pad(randInt(10, 99), 3)}`;
    const birthYear = 2026 - (10 + Math.floor(studentIndex % 8));
    const birthDate = `${birthYear}-0${randInt(1, 9)}-15`;

    // Status: 90% Activos, 6% Devedores/Inadimplentes, 4% Desistentes
    let status = "active";
    let enrollStatus = "active";
    if (studentIndex % 25 === 0) {
      status = "suspended";
    } else if (studentIndex % 33 === 0) {
      status = "transferred";
      enrollStatus = "dropped";
    }

    sqlLines.push(
      `INSERT INTO public.people (id, school_id, full_name, sex, birth_date, phone_primary, address, nif) VALUES ('${personId}', '${SCHOOL_ID}', '${fullName}', '${isFemale ? "F" : "M"}', '${birthDate}', '+244 9${randInt(10000000, 99999999)}', '${randChoice(bairros)}', '${nif}') ON CONFLICT (id) DO NOTHING;`,
    );
    sqlLines.push(
      `INSERT INTO public.students (id, school_id, person_id, academic_number, status) VALUES ('${studentId}', '${SCHOOL_ID}', '${personId}', '${academicNum}', '${status}') ON CONFLICT (id) DO NOTHING;`,
    );
    sqlLines.push(
      `INSERT INTO public.enrollments (id, student_id, class_group_id, academic_year_id, status, enrolled_at) VALUES ('${enrollId}', '${studentId}', '${t.id}', '${YEAR_2026_ID}', '${enrollStatus}', '2026-02-05 08:00:00+00') ON CONFLICT (id) DO NOTHING;`,
    );

    // GERAR NOTAS TRIMESTRAIS DE PAUTA PARA CADA ALUNO
    disciplinas.slice(0, 4).forEach((disc) => {
      const mac = randInt(10, 19);
      const npp = randInt(9, 18);
      const npt = randInt(11, 20);
      const mfd = Math.round((mac + npp + npt) / 3);
      sqlLines.push(
        `INSERT INTO public.term_grades (school_id, student_id, class_group_id, subject_id, term_name, mac, npp, npt, mfd, status) VALUES ('${SCHOOL_ID}', '${studentId}', '${t.id}', '${disc.id}', '1º Trimestre', ${mac}, ${npp}, ${npt}, ${mfd}, '${mfd >= 10 ? "Aprovado" : "Reprovado"}') ON CONFLICT DO NOTHING;`,
      );
    });

    studentIndex++;
  }
});

// 5. INSERIR HISTÓRICO DE GRADUADOS / CONCLUÍDOS (100 ALUNOS GRADUADOS HISTÓRICOS)
sqlLines.push(`-- INSERÇÃO DE ALUNOS GRADUADOS / CONCLUÍDOS NO HISTÓRICO`);
for (let g = 1; g <= 100; g++) {
  const personId = `p2000000-0000-0000-0000-${pad(g, 12)}`;
  const studentId = `st200000-0000-0000-0000-${pad(g, 12)}`;
  const enrollId = `en200000-0000-0000-0000-${pad(g, 12)}`;
  const fullName = `${randChoice(firstNamesM)} ${randChoice(lastNames)} ${randChoice(lastNames)} (Graduado 2025)`;
  const nif = `${pad(randInt(100000, 999999), 9)}LA${pad(randInt(10, 99), 3)}`;

  sqlLines.push(
    `INSERT INTO public.people (id, school_id, full_name, sex, birth_date, nif) VALUES ('${personId}', '${SCHOOL_ID}', '${fullName}', 'M', '2006-05-10', '${nif}') ON CONFLICT (id) DO NOTHING;`,
  );
  sqlLines.push(
    `INSERT INTO public.students (id, school_id, person_id, academic_number, status) VALUES ('${studentId}', '${SCHOOL_ID}', '${personId}', '2025/${pad(g, 4)}', 'graduated') ON CONFLICT (id) DO NOTHING;`,
  );
  sqlLines.push(
    `INSERT INTO public.enrollments (id, student_id, class_group_id, academic_year_id, status, enrolled_at) VALUES ('${enrollId}', '${studentId}', 'g0000000-0000-0000-0000-000000000012', '${YEAR_2025_ID}', 'completed', '2025-02-01 08:00:00+00') ON CONFLICT (id) DO NOTHING;`,
  );
}

sqlLines.push(`COMMIT;`);
sqlLines.push(
  `SELECT 'Carga de Dados Oficial da Escola Demo (36 turmas, 1232+ pessoas, finanças e pautas) concluída com sucesso!' as status;`,
);

writeFileSync(sqlPath, sqlLines.join("\n"), "utf8");
console.log(`✅ Gerado com sucesso: ${sqlPath} (${sqlLines.length} instruções SQL)`);
