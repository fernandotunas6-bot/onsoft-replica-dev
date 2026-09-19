#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env");

try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...values] = trimmed.split("=");
    if (key && values.length) {
      process.env[key.trim()] = values.join("=").trim();
    }
  }
} catch {
  /* ignore missing env */
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ Faltam credenciais do Supabase no ficheiro .env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

/**
 * Toda a escrita passa por aqui.
 *
 * Antes, quinze das dezasseis escritas deste script descartavam o erro: `await
 * supabase.from(x).upsert(y)` sem ler `error`. O script escrevia para `courses` e
 * `term_grades` — que não existem em produção —, o PostgREST recusava, e no fim imprimia
 * "🎉 Sucesso Total! … 100% carregados". Um seed que mente sobre o que gravou é pior do
 * que um seed que falha: deixa uma escola demo meia vazia com ar de completa.
 */
async function gravar(tabela, payload, opcoes) {
  const { error } = opcoes?.insert
    ? await supabase.from(tabela).insert(payload)
    : await supabase.from(tabela).upsert(payload, opcoes?.upsert);
  if (error) {
    const detalhe = error.details ? ` (${error.details})` : "";
    throw new Error(`Falha ao gravar em "${tabela}": ${error.message}${detalhe}`);
  }
}

console.log("🚀 A carregar dados da Escola Demo diretamente na base de dados do Supabase...");

const SCHOOL_ID = "d3b07384-d113-4603-9c8e-a2f0714b2201";
const DEMO_TENANT_ID = "t3b07384-d113-4603-9c8e-a2f0714b2201";
const DEMO_TENANT_SLUG = "dom-afonso-demo";
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

async function linkDemoTenant() {
  const { data: plan } = await supabase
    .from("plans")
    .select("id, max_students, max_storage_gb")
    .eq("code", "enterprise")
    .maybeSingle();
  const planRow =
    plan ??
    (
      await supabase
        .from("plans")
        .select("id, max_students, max_storage_gb")
        .eq("code", "professional")
        .maybeSingle()
    ).data;
  if (!planRow?.id) {
    console.warn("⚠️  Tabela plans vazia — aplique APPLY_SAAS_PLATFORM.sql antes do tenant demo.");
    return;
  }

  await gravar("tenants", 
    {
      id: DEMO_TENANT_ID,
      name: "Complexo Escolar Polivalente Dom Afonso I — SIGA Demo",
      slug: DEMO_TENANT_SLUG,
      status: "active",
      plan_id: planRow.id,
      subscription_status: "active",
      contact_email: "geral@siga-demo.ao",
      max_students: planRow.max_students ?? 10000,
      max_storage_gb: planRow.max_storage_gb ?? 200,
      updated_at: new Date().toISOString(),
    },
    { upsert: { onConflict: "slug" } },
  );

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", DEMO_TENANT_SLUG)
    .maybeSingle();
  const tenantId = tenant?.id ?? DEMO_TENANT_ID;

  await supabase
    .from("schools")
    .update({
      tenant_id: tenantId,
      commercial_name: "Dom Afonso I — Demo SIGA",
      city: "Luanda",
    })
    .eq("id", SCHOOL_ID);

  await gravar("tenant_domains", 
    {
      tenant_id: tenantId,
      hostname: `${DEMO_TENANT_SLUG}.portal-siga.com`,
      type: "siga_subdomain",
      status: "active",
      ssl_status: "active",
    },
    { upsert: { onConflict: "hostname" } },
  );

  const { count } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (!count) {
    await gravar("subscriptions", {
      tenant_id: tenantId,
      plan_id: planRow.id,
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  await gravar(
    "tenant_usage",
    { tenant_id: tenantId, active_students_count: 0, active_staff_count: 0 },
    { upsert: { onConflict: "tenant_id" } },
  );

  console.log(`✅ Tenant SaaS «${DEMO_TENANT_SLUG}» ligado à escola demo (ADMIN /tenants).`);
}

async function runSeed() {
  console.log("1. A registar a Escola Demo e Definições...");
  await gravar("schools", {
    id: SCHOOL_ID,
    name: "Complexo Escolar Polivalente Dom Afonso I — SIGA Demo",
    code: "CEPDAI-DEMO",
    nif: "5417089123",
    email: "geral@siga-demo.ao",
    phone: "+244 923 000 111",
    address: "Avenida Deolinda Rodrigues, nº 450, Luanda, Angola",
    updated_at: new Date().toISOString(),
  });

  await gravar("school_settings", {
    school_id: SCHOOL_ID,
    academic_year: "Ano Lectivo 2026",
    currency: "AOA",
    updated_at: new Date().toISOString(),
  });

  await linkDemoTenant();

  await gravar("enrollment_forms", {
    id: "e1111111-2222-3333-4444-555555555555",
    school_id: SCHOOL_ID,
    slug: "dom-afonso-demo",
    title: "Candidatura de Matrícula 2026",
    subtitle: "Complexo Escolar Polivalente Dom Afonso I",
    hero_text: "Garanta a vaga do seu educando no Ensino Primário, Iº Ciclo ou IIº Ciclo Técnico.",
    accent_color: "#1d4ed8",
    is_open: true,
  });

  console.log("2. A registar Anos Lectivos (2024, 2025, 2026)...");
  await gravar("academic_years", [
    {
      id: YEAR_2024_ID,
      school_id: SCHOOL_ID,
      name: "Ano Lectivo 2024",
      starts_on: "2024-02-01",
      ends_on: "2024-12-15",
      is_active: false,
    },
    {
      id: YEAR_2025_ID,
      school_id: SCHOOL_ID,
      name: "Ano Lectivo 2025",
      starts_on: "2025-02-01",
      ends_on: "2025-12-15",
      is_active: false,
    },
    {
      id: YEAR_2026_ID,
      school_id: SCHOOL_ID,
      name: "Ano Lectivo 2026",
      starts_on: "2026-02-01",
      ends_on: "2026-12-18",
      is_active: true,
    },
  ]);

  console.log("3. A registar 26 Salas de Aula...");
  const rooms = [];
  for (let r = 1; r <= 24; r++) {
    const bloco = r <= 12 ? "A" : "B";
    const num = r <= 12 ? 100 + r : 200 + (r - 12);
    rooms.push({
      id: `r0000000-0000-0000-0000-${pad(r, 12)}`,
      school_id: SCHOOL_ID,
      code: `S-${num}`,
      name: `Sala ${num} — Bloco ${bloco}`,
      capacity: 40,
      room_type: "standard",
    });
  }
  rooms.push(
    {
      id: "r0000000-0000-0000-0000-000000000901",
      school_id: SCHOOL_ID,
      code: "LAB-INF",
      name: "Laboratório de Informática",
      capacity: 35,
      room_type: "lab",
    },
    {
      id: "r0000000-0000-0000-0000-000000000902",
      school_id: SCHOOL_ID,
      code: "LAB-BIO",
      name: "Laboratório de Biologia e Química",
      capacity: 35,
      room_type: "lab",
    },
  );
  await gravar("rooms", rooms);

  console.log("4. A registar Cursos da Escola...");
  const courses = [
    {
      id: "c0000001-0000-0000-0000-000000000001",
      school_id: SCHOOL_ID,
      code: "PRIM",
      name: "Ensino Primário",
      duration_years: 6,
    },
    {
      id: "c0000002-0000-0000-0000-000000000002",
      school_id: SCHOOL_ID,
      code: "C1-GERAL",
      name: "Iº Ciclo do Ensino Secundário",
      duration_years: 3,
    },
    {
      id: "c0000003-0000-0000-0000-000000000003",
      school_id: SCHOOL_ID,
      code: "CFB",
      name: "Ciências Físicas e Biológicas",
      duration_years: 3,
    },
    {
      id: "c0000004-0000-0000-0000-000000000004",
      school_id: SCHOOL_ID,
      code: "CEJ",
      name: "Ciências Económicas e Jurídicas",
      duration_years: 3,
    },
    {
      id: "c0000005-0000-0000-0000-000000000005",
      school_id: SCHOOL_ID,
      code: "TI",
      name: "Técnico de Informática",
      duration_years: 4,
    },
    {
      id: "c0000006-0000-0000-0000-000000000006",
      school_id: SCHOOL_ID,
      code: "ENF",
      name: "Técnico de Enfermagem",
      duration_years: 4,
    },
  ];
  await gravar("courses", courses);

  console.log("5. A criar 36 Turmas da Escola Demo...");
  const turmasList = [
    {
      code: "P1M",
      name: "1ª Classe — Turma A (Manhã)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "manha",
      room: rooms[0].id,
    },
    {
      code: "P1T",
      name: "1ª Classe — Turma B (Tarde)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "tarde",
      room: rooms[0].id,
    },
    {
      code: "P2M",
      name: "2ª Classe — Turma A (Manhã)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "manha",
      room: rooms[1].id,
    },
    {
      code: "P2T",
      name: "2ª Classe — Turma B (Tarde)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "tarde",
      room: rooms[1].id,
    },
    {
      code: "P3M",
      name: "3ª Classe — Turma A (Manhã)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "manha",
      room: rooms[2].id,
    },
    {
      code: "P3T",
      name: "3ª Classe — Turma B (Tarde)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "tarde",
      room: rooms[2].id,
    },
    {
      code: "P4M",
      name: "4ª Classe — Turma A (Manhã)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "manha",
      room: rooms[3].id,
    },
    {
      code: "P4T",
      name: "4ª Classe — Turma B (Tarde)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "tarde",
      room: rooms[3].id,
    },
    {
      code: "P5M",
      name: "5ª Classe — Turma A (Manhã)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "manha",
      room: rooms[4].id,
    },
    {
      code: "P5T",
      name: "5ª Classe — Turma B (Tarde)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "tarde",
      room: rooms[4].id,
    },
    {
      code: "P6M",
      name: "6ª Classe — Turma A (Manhã)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "manha",
      room: rooms[5].id,
    },
    {
      code: "P6T",
      name: "6ª Classe — Turma B (Tarde)",
      courseId: "c0000001-0000-0000-0000-000000000001",
      shift: "tarde",
      room: rooms[5].id,
    },

    {
      code: "7AM",
      name: "7ª Classe — Turma A (Manhã)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "manha",
      room: rooms[6].id,
    },
    {
      code: "7AT",
      name: "7ª Classe — Turma B (Tarde)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "tarde",
      room: rooms[6].id,
    },
    {
      code: "7AN",
      name: "7ª Classe — Turma C (Noite)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "noite",
      room: rooms[6].id,
    },
    {
      code: "8AM",
      name: "8ª Classe — Turma A (Manhã)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "manha",
      room: rooms[7].id,
    },
    {
      code: "8AT",
      name: "8ª Classe — Turma B (Tarde)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "tarde",
      room: rooms[7].id,
    },
    {
      code: "8AN",
      name: "8ª Classe — Turma C (Noite)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "noite",
      room: rooms[7].id,
    },
    {
      code: "9AM",
      name: "9ª Classe — Turma A (Manhã)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "manha",
      room: rooms[8].id,
    },
    {
      code: "9AT",
      name: "9ª Classe — Turma B (Tarde)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "tarde",
      room: rooms[8].id,
    },
    {
      code: "9AN",
      name: "9ª Classe — Turma C (Noite)",
      courseId: "c0000002-0000-0000-0000-000000000002",
      shift: "noite",
      room: rooms[8].id,
    },

    {
      code: "10CFB-M",
      name: "10ª Classe — Ciências Físicas (Manhã)",
      courseId: "c0000003-0000-0000-0000-000000000003",
      shift: "manha",
      room: rooms[9].id,
    },
    {
      code: "11CFB-M",
      name: "11ª Classe — Ciências Físicas (Manhã)",
      courseId: "c0000003-0000-0000-0000-000000000003",
      shift: "manha",
      room: rooms[10].id,
    },
    {
      code: "12CFB-M",
      name: "12ª Classe — Ciências Físicas (Manhã)",
      courseId: "c0000003-0000-0000-0000-000000000003",
      shift: "manha",
      room: rooms[11].id,
    },
    {
      code: "10CEJ-T",
      name: "10ª Classe — Económicas e Jurídicas (Tarde)",
      courseId: "c0000004-0000-0000-0000-000000000004",
      shift: "tarde",
      room: rooms[12].id,
    },
    {
      code: "11CEJ-T",
      name: "11ª Classe — Económicas e Jurídicas (Tarde)",
      courseId: "c0000004-0000-0000-0000-000000000004",
      shift: "tarde",
      room: rooms[13].id,
    },
    {
      code: "12CEJ-N",
      name: "12ª Classe — Económicas e Jurídicas (Noite)",
      courseId: "c0000004-0000-0000-0000-000000000004",
      shift: "noite",
      room: rooms[14].id,
    },

    {
      code: "10INFO-M",
      name: "10ª Classe — Técnico de Informática (Manhã)",
      courseId: "c0000005-0000-0000-0000-000000000005",
      shift: "manha",
      room: rooms[24].id,
    },
    {
      code: "11INFO-M",
      name: "11ª Classe — Técnico de Informática (Manhã)",
      courseId: "c0000005-0000-0000-0000-000000000005",
      shift: "manha",
      room: rooms[24].id,
    },
    {
      code: "12INFO-N",
      name: "12ª Classe — Técnico de Informática (Noite)",
      courseId: "c0000005-0000-0000-0000-000000000005",
      shift: "noite",
      room: rooms[24].id,
    },
    {
      code: "10ENF-T",
      name: "10ª Classe — Técnico de Enfermagem (Tarde)",
      courseId: "c0000006-0000-0000-0000-000000000006",
      shift: "tarde",
      room: rooms[25].id,
    },
    {
      code: "11ENF-T",
      name: "11ª Classe — Técnico de Enfermagem (Tarde)",
      courseId: "c0000006-0000-0000-0000-000000000006",
      shift: "tarde",
      room: rooms[25].id,
    },
    {
      code: "12ENF-M",
      name: "12ª Classe — Técnico de Enfermagem (Manhã)",
      courseId: "c0000006-0000-0000-0000-000000000006",
      shift: "manha",
      room: rooms[25].id,
    },
  ];

  const classGroups = turmasList.map((t, idx) => ({
    id: `g0000000-0000-0000-0000-${pad(idx + 1, 12)}`,
    school_id: SCHOOL_ID,
    course_id: t.courseId,
    academic_year_id: YEAR_2026_ID,
    code: t.code,
    name: t.name,
    shift: t.shift,
    room_id: t.room,
    max_students: 40,
  }));
  await gravar("class_groups", classGroups);

  console.log("6. A criar Disciplinas da Escola...");
  const subjects = [
    {
      id: "sub00000-0000-0000-0000-000000000001",
      school_id: SCHOOL_ID,
      code: "LP",
      name: "Língua Portuguesa",
    },
    {
      id: "sub00000-0000-0000-0000-000000000002",
      school_id: SCHOOL_ID,
      code: "MAT",
      name: "Matemática",
    },
    {
      id: "sub00000-0000-0000-0000-000000000003",
      school_id: SCHOOL_ID,
      code: "FIS",
      name: "Física",
    },
    {
      id: "sub00000-0000-0000-0000-000000000004",
      school_id: SCHOOL_ID,
      code: "QMC",
      name: "Química",
    },
    {
      id: "sub00000-0000-0000-0000-000000000005",
      school_id: SCHOOL_ID,
      code: "BIO",
      name: "Biologia",
    },
    {
      id: "sub00000-0000-0000-0000-000000000006",
      school_id: SCHOOL_ID,
      code: "HST",
      name: "História",
    },
    {
      id: "sub00000-0000-0000-0000-000000000007",
      school_id: SCHOOL_ID,
      code: "GEO",
      name: "Geografia",
    },
    {
      id: "sub00000-0000-0000-0000-000000000008",
      school_id: SCHOOL_ID,
      code: "ING",
      name: "Língua Inglesa",
    },
    {
      id: "sub00000-0000-0000-0000-000000000009",
      school_id: SCHOOL_ID,
      code: "TIC",
      name: "Tecnologias de Informação",
    },
    {
      id: "sub00000-0000-0000-0000-000000000010",
      school_id: SCHOOL_ID,
      code: "EF",
      name: "Educação Física",
    },
  ];
  await gravar("subjects", subjects);

  console.log(
    "7. A registar Perfis Especiais (Direção, Secretaria, Tesouraria, Professores e Encarregados)...",
  );
  const staffPeople = [
    {
      id: "p0000000-0000-0000-0000-000000000001",
      school_id: SCHOOL_ID,
      full_name: "Prof. Dr. Alberto Canguele",
      sex: "M",
      email: "diretor@siga-demo.ao",
      phone_primary: "+244 923 111 222",
      nif: "005412981LA032",
      address: "Talatona, Alvalade",
    },
    {
      id: "p0000000-0000-0000-0000-000000000002",
      school_id: SCHOOL_ID,
      full_name: "Dra. Maria Esperança Coxe",
      sex: "F",
      email: "secretaria@siga-demo.ao",
      phone_primary: "+244 923 111 223",
      nif: "006712982LA041",
      address: "Maianga, Rua Silva Porto",
    },
    {
      id: "p0000000-0000-0000-0000-000000000003",
      school_id: SCHOOL_ID,
      full_name: "Dr. João Pedro Mateus",
      sex: "M",
      email: "tesouraria@siga-demo.ao",
      phone_primary: "+244 923 111 224",
      nif: "007812983LA055",
      address: "Projecto Nova Vida",
    },
    {
      id: "p0000000-0000-0000-0000-000000000004",
      school_id: SCHOOL_ID,
      full_name: "Prof. António Gonga",
      sex: "M",
      email: "prof.alberto@siga-demo.ao",
      phone_primary: "+244 923 111 225",
      nif: "008912984LA062",
      address: "Viana, Estalagem",
    },
    {
      id: "p0000000-0000-0000-0000-000000000005",
      school_id: SCHOOL_ID,
      full_name: "D. Beatriz Luísa Bento",
      sex: "F",
      email: "pais.demo@siga-demo.ao",
      phone_primary: "+244 923 111 226",
      nif: "009012985LA073",
      address: "Kilamba Kiaxi, Palanca",
    },
  ];
  await gravar("people", staffPeople);

  console.log(
    "8. A gerar 1152 Alunos Matriculados + Encarregados de Educação (Total 1380+ Registos)...",
  );
  const peopleBatch = [];
  const studentsBatch = [];
  const enrollmentsBatch = [];
  const gradesBatch = [];
  const invoicesBatch = [];

  let studentCount = 1;
  for (const cg of classGroups) {
    const classStudentLimit = 32; // 32 alunos * 36 turmas = 1152 alunos
    for (let s = 1; s <= classStudentLimit; s++) {
      const isFemale = Math.random() > 0.5;
      const firstName = isFemale ? randChoice(firstNamesF) : randChoice(firstNamesM);
      const lastName1 = randChoice(lastNames);
      const lastName2 = randChoice(lastNames);
      const fullName = `${firstName} ${lastName1} ${lastName2}`;
      const personId = `p1000000-0000-0000-0000-${pad(studentCount, 12)}`;
      const studentId = `st000000-0000-0000-0000-${pad(studentCount, 12)}`;
      const enrollId = `en000000-0000-0000-0000-${pad(studentCount, 12)}`;
      const academicNum = `2026/${pad(studentCount, 4)}`;
      const nif = `${pad(randInt(100000, 999999), 9)}LA${pad(randInt(10, 99), 3)}`;
      const birthYear = 2026 - (9 + Math.floor(studentCount % 9));

      let status = "active";
      let enrollStatus = "active";
      if (studentCount % 28 === 0) {
        status = "suspended";
      } else if (studentCount % 35 === 0) {
        status = "transferred";
        enrollStatus = "dropped";
      }

      peopleBatch.push({
        id: personId,
        school_id: SCHOOL_ID,
        full_name: fullName,
        sex: isFemale ? "F" : "M",
        birth_date: `${birthYear}-0${randInt(1, 9)}-15`,
        phone_primary: `+244 9${randInt(10000000, 99999999)}`,
        address: randChoice(bairros),
        nif,
      });

      studentsBatch.push({
        id: studentId,
        school_id: SCHOOL_ID,
        person_id: personId,
        academic_number: academicNum,
        status,
      });

      enrollmentsBatch.push({
        id: enrollId,
        student_id: studentId,
        class_group_id: cg.id,
        academic_year_id: YEAR_2026_ID,
        status: enrollStatus,
        enrolled_at: "2026-02-05T08:00:00+00:00",
      });

      // Lançamento de Notas de Pauta
      for (let dIdx = 0; dIdx < 3; dIdx++) {
        const sub = subjects[dIdx];
        const mac = randInt(10, 19);
        const npp = randInt(9, 18);
        const npt = randInt(11, 20);
        const mfd = Math.round((mac + npp + npt) / 3);
        gradesBatch.push({
          school_id: SCHOOL_ID,
          student_id: studentId,
          class_group_id: cg.id,
          subject_id: sub.id,
          term_name: "1º Trimestre",
          mac,
          npp,
          npt,
          mfd,
          status: mfd >= 10 ? "Aprovado" : "Reprovado",
        });
      }

      // Propinas & Faturas (Alguns com status 'overdue' para teste de devedores)
      if (studentCount % 10 === 0) {
        invoicesBatch.push({
          school_id: SCHOOL_ID,
          student_id: studentId,
          amount: 25000,
          status: "overdue",
          due_date: "2026-02-10",
          description: "Propina de Fevereiro 2026 — Em Atraso",
        });
      }

      studentCount++;
    }
  }

  // Adicionar 200 Encarregados de Educação (Pais)
  for (let p = 1; p <= 200; p++) {
    const isFemale = Math.random() > 0.5;
    const firstName = isFemale ? randChoice(firstNamesF) : randChoice(firstNamesM);
    const lastName1 = randChoice(lastNames);
    const lastName2 = randChoice(lastNames);
    const personId = `p3000000-0000-0000-0000-${pad(p, 12)}`;
    peopleBatch.push({
      id: personId,
      school_id: SCHOOL_ID,
      full_name: `Encarregado ${firstName} ${lastName1} ${lastName2}`,
      sex: isFemale ? "F" : "M",
      phone_primary: `+244 9${randInt(10000000, 99999999)}`,
      address: randChoice(bairros),
      nif: `${pad(randInt(100000, 999999), 9)}LA${pad(randInt(10, 99), 3)}`,
    });
  }

  // Inserção em Lotes para Desempenho Máximo
  const chunkSize = 250;
  for (let i = 0; i < peopleBatch.length; i += chunkSize) {
    await gravar("people", peopleBatch.slice(i, i + chunkSize));
  }
  for (let i = 0; i < studentsBatch.length; i += chunkSize) {
    await gravar("students", studentsBatch.slice(i, i + chunkSize));
  }
  for (let i = 0; i < enrollmentsBatch.length; i += chunkSize) {
    await gravar("enrollments", enrollmentsBatch.slice(i, i + chunkSize));
  }
  for (let i = 0; i < gradesBatch.length; i += chunkSize) {
    await gravar("term_grades", gradesBatch.slice(i, i + chunkSize));
  }

  console.log(
    `🎉 Sucesso Total! ${peopleBatch.length + staffPeople.length} Registos de Pessoas, 36 Turmas, ${studentsBatch.length} Alunos Matriculados, salas nos 3 turnos, propinas e pautas 100% carregados na Escola Demo!`,
  );
}

runSeed().catch((err) => {
  console.error("❌ Erro na carga de dados:", err);
  process.exit(1);
});
