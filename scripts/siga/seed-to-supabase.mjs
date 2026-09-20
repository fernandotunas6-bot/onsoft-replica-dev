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

/**
 * Identificadores determinísticos da escola demo.
 *
 * Os anteriores não eram UUID. `p0000000-…`, `st000000-…`, `g0000000-…`,
 * `r0000000-…`, `sub00000-…`, `en000000-…` e `t3b07384-…` usam `p`, `s`, `t`,
 * `g`, `r`, `u` e `n` — nenhum é dígito hexadecimal. O Postgres recusa cada um
 * com 22P02, e desde que as escritas deixaram de engolir o erro o seed parava
 * na primeira sala. Os prefixos abaixo são todos hexadecimais.
 */
const NS = {
  campus: "ca",
  sala: "a0",
  nivel: "c0",
  classe: "d0",
  turma: "e0",
  disciplina: "f0",
  pessoalEscola: "a1",
  pessoaAluno: "b1",
  encarregado: "c1",
  aluno: "e1",
  matricula: "d1",
  planoPropina: "a2",
  itemPropina: "b2",
  contrato: "c2",
  fatura: "f2",
  avaliacao: "a3",
};
const idDemo = (ns, n) => `${ns}000000-0000-4000-8000-${pad(n, 12)}`;

/**
 * `created_by`/`updated_by` são NOT NULL sem omissão em people, students,
 * subjects, class_groups, enrollments, finance_contracts e finance_invoices —
 * na produção nunca estão vazios. A aplicação preenche-os com `context.userId`;
 * um seed não tem sessão, por isso o autor tem de ser dito. Adivinhá-lo para
 * milhares de linhas de auditoria seria pior do que parar.
 */
async function resolverAutor() {
  const explicito = process.env.SEED_ACTOR_USER_ID?.trim();
  if (explicito) return explicito;

  const email = process.env.SEED_ACTOR_EMAIL?.trim();
  if (email) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(`Não foi possível procurar ${email}: ${error.message}`);
    const achado = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (achado) return achado.id;
    throw new Error(`SEED_ACTOR_EMAIL=${email} não corresponde a nenhum utilizador.`);
  }

  throw new Error(
    "Falta o autor das escritas. Defina SEED_ACTOR_USER_ID (uuid de auth.users) ou " +
      "SEED_ACTOR_EMAIL no .env — created_by/updated_by são obrigatórios e não podem ser inventados.",
  );
}

let AUTOR = null;

console.log("🚀 A carregar dados da Escola Demo diretamente na base de dados do Supabase...");

const SCHOOL_ID = "d3b07384-d113-4603-9c8e-a2f0714b2201";
const DEMO_TENANT_ID = "73b07384-d113-4603-9c8e-a2f0714b2201";
const DEMO_TENANT_SLUG = "dom-afonso-demo";
const YEAR_2026_ID = "a2026000-0000-0000-0000-000000002026";
const CAMPUS_ID = idDemo(NS.campus, 1);
const NIVEL_PRIMARIO = idDemo(NS.nivel, 1);
const NIVEL_CICLO_I = idDemo(NS.nivel, 2);
const NIVEL_CICLO_II = idDemo(NS.nivel, 3);

/** manha/tarde/noite não são valores de `class_groups.shift`; o enum é inglês. */
const TURNO = { manha: "morning", tarde: "afternoon", noite: "evening" };

const FEE_PLAN_ID = idDemo(NS.planoPropina, 1);
const FEE_ITEM_PROPINA = idDemo(NS.itemPropina, 1);
const FEE_ITEM_MATRICULA = idDemo(NS.itemPropina, 2);

/** Componentes da pauta angolana. `kind` e `component` seguem os enums da app. */
const COMPONENTES = [
  { nome: "MAC", kind: "continua", min: 10, max: 19 },
  { nome: "NPP", kind: "prova", min: 9, max: 18 },
  { nome: "NPT", kind: "teste", min: 11, max: 20 },
];
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

  await gravar(
    "tenants",
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

  await gravar(
    "tenant_domains",
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
  AUTOR = await resolverAutor();
  console.log(`Autor das escritas: ${AUTOR}`);

  console.log("1. A registar a Escola Demo e Definições...");
  await gravar("schools", {
    id: SCHOOL_ID,
    name: "Complexo Escolar Polivalente Dom Afonso I — SIGA Demo",
    public_code: "CEPDAI-DEMO",
    nif: "5417089123",
    email: "geral@siga-demo.ao",
    phone: "+244 923 000 111",
    address: "Avenida Deolinda Rodrigues, nº 450, Luanda, Angola",
    updated_at: new Date().toISOString(),
  });

  // school_settings é chave-valor versionada (domain/value/version), não uma
  // linha plana: `academic_year` e `currency` nunca foram colunas desta tabela.
  await gravar(
    "school_settings",
    {
      school_id: SCHOOL_ID,
      domain: "geral",
      value: { academic_year: "Ano Lectivo 2026", currency: "AOA" },
      version: 1,
      changed_by: AUTOR,
    },
    { upsert: { onConflict: "school_id,domain" } },
  );

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
      status: "closed",
    },
    {
      id: YEAR_2025_ID,
      school_id: SCHOOL_ID,
      name: "Ano Lectivo 2025",
      starts_on: "2025-02-01",
      ends_on: "2025-12-15",
      status: "closed",
    },
    {
      id: YEAR_2026_ID,
      school_id: SCHOOL_ID,
      name: "Ano Lectivo 2026",
      starts_on: "2026-02-01",
      ends_on: "2026-12-18",
      status: "active",
    },
  ]);

  // O campus é obrigatório em class_groups (campus_id NOT NULL) e nunca era criado.
  await gravar("campuses", {
    id: CAMPUS_ID,
    school_id: SCHOOL_ID,
    code: "SEDE",
    name: "Campus Principal",
    province: "Luanda",
    municipality: "Luanda",
  });

  console.log("3. A registar as salas de aula...");
  const rooms = [];
  for (let r = 1; r <= 24; r++) {
    const bloco = r <= 12 ? "A" : "B";
    const num = r <= 12 ? 100 + r : 200 + (r - 12);
    rooms.push({
      id: idDemo(NS.sala, r),
      school_id: SCHOOL_ID,
      code: `S-${num}`,
      name: `Sala ${num} — Bloco ${bloco}`,
      campus_id: CAMPUS_ID,
      capacity: 40,
      room_type: "standard",
    });
  }
  rooms.push(
    {
      id: idDemo(NS.sala, 901),
      school_id: SCHOOL_ID,
      code: "LAB-INF",
      campus_id: CAMPUS_ID,
      name: "Laboratório de Informática",
      capacity: 35,
      room_type: "computer_lab",
    },
    {
      id: idDemo(NS.sala, 902),
      school_id: SCHOOL_ID,
      code: "LAB-BIO",
      campus_id: CAMPUS_ID,
      name: "Laboratório de Biologia e Química",
      capacity: 35,
      room_type: "biology_lab",
    },
  );
  await gravar("rooms", rooms);
  console.log(`   ${rooms.length} salas registadas.`);

  // `courses` não existe na produção: o modelo real é academic_levels → programs
  // → grade_levels. `duration_years` também não é coluna de nenhuma delas.
  console.log("4. A registar Níveis, Programas e Classes...");
  await gravar("academic_levels", [
    {
      id: NIVEL_PRIMARIO,
      school_id: SCHOOL_ID,
      code: "primary",
      name: "Ensino Primário",
      sequence: 1,
    },
    {
      id: NIVEL_CICLO_I,
      school_id: SCHOOL_ID,
      code: "cycle_i",
      name: "Iº Ciclo do Ensino Secundário",
      sequence: 2,
    },
    {
      id: NIVEL_CICLO_II,
      school_id: SCHOOL_ID,
      code: "cycle_ii",
      name: "IIº Ciclo do Ensino Secundário",
      sequence: 3,
    },
  ]);

  const programs = [
    {
      id: "c0000001-0000-0000-0000-000000000001",
      school_id: SCHOOL_ID,
      code: "PRIM",
      name: "Ensino Primário",
      academic_level_id: NIVEL_PRIMARIO,
      kind: "general",
    },
    {
      id: "c0000002-0000-0000-0000-000000000002",
      school_id: SCHOOL_ID,
      code: "C1-GERAL",
      name: "Iº Ciclo do Ensino Secundário",
      academic_level_id: NIVEL_CICLO_I,
      kind: "general",
    },
    {
      id: "c0000003-0000-0000-0000-000000000003",
      school_id: SCHOOL_ID,
      code: "CFB",
      name: "Ciências Físicas e Biológicas",
      academic_level_id: NIVEL_CICLO_II,
      kind: "general",
    },
    {
      id: "c0000004-0000-0000-0000-000000000004",
      school_id: SCHOOL_ID,
      code: "CEJ",
      name: "Ciências Económicas e Jurídicas",
      academic_level_id: NIVEL_CICLO_II,
      kind: "general",
    },
    {
      id: "c0000005-0000-0000-0000-000000000005",
      school_id: SCHOOL_ID,
      code: "TI",
      name: "Técnico de Informática",
      academic_level_id: NIVEL_CICLO_II,
      kind: "technical",
    },
    {
      id: "c0000006-0000-0000-0000-000000000006",
      school_id: SCHOOL_ID,
      code: "ENF",
      name: "Técnico de Enfermagem",
      academic_level_id: NIVEL_CICLO_II,
      kind: "technical",
    },
  ];
  await gravar("programs", programs);
  const programCodeById = new Map(programs.map((p) => [p.id, p.code]));

  console.log("5. A criar as turmas da Escola Demo...");
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

  // As classes (`grade_levels`) são derivadas da lista acima em vez de ficarem
  // numa lista à parte: uma segunda lista divergiria à primeira turma nova.
  // `grade_levels.program_id` é NOT NULL, e `class_groups.grade_level_id` também.
  const gradeLevelKey = (t) => `${t.courseId}|${t.name.split("—")[0].trim()}`;
  const gradeLevels = [];
  const gradeLevelIdByKey = new Map();
  for (const t of turmasList) {
    const key = gradeLevelKey(t);
    if (gradeLevelIdByKey.has(key)) continue;
    const classe = t.name.split("—")[0].trim();
    const ordem = Number(classe.match(/^(\d+)/)?.[1] ?? gradeLevels.length + 1);
    const id = idDemo(NS.classe, gradeLevels.length + 1);
    gradeLevelIdByKey.set(key, id);
    gradeLevels.push({
      id,
      school_id: SCHOOL_ID,
      program_id: t.courseId,
      code: `${programCodeById.get(t.courseId)}-${ordem}`,
      name: classe,
      sequence: ordem,
    });
  }
  await gravar("grade_levels", gradeLevels);

  // `course_id`, `room_id` e `max_students` não são colunas de class_groups. A
  // sala não vive aqui (vive no horário), a capacidade chama-se `capacity`, e
  // `campus_id` é obrigatório.
  const classGroups = turmasList.map((t, idx) => ({
    id: idDemo(NS.turma, idx + 1),
    school_id: SCHOOL_ID,
    academic_year_id: YEAR_2026_ID,
    campus_id: CAMPUS_ID,
    grade_level_id: gradeLevelIdByKey.get(gradeLevelKey(t)),
    code: t.code,
    name: t.name,
    shift: TURNO[t.shift] ?? t.shift,
    capacity: 40,
    created_by: AUTOR,
    updated_by: AUTOR,
  }));
  await gravar("class_groups", classGroups);

  console.log("6. A criar Disciplinas da Escola...");
  const subjects = [
    {
      id: idDemo(NS.disciplina, 1),
      school_id: SCHOOL_ID,
      code: "LP",
      name: "Língua Portuguesa",
    },
    {
      id: idDemo(NS.disciplina, 2),
      school_id: SCHOOL_ID,
      code: "MAT",
      name: "Matemática",
    },
    {
      id: idDemo(NS.disciplina, 3),
      school_id: SCHOOL_ID,
      code: "FIS",
      name: "Física",
    },
    {
      id: idDemo(NS.disciplina, 4),
      school_id: SCHOOL_ID,
      code: "QMC",
      name: "Química",
    },
    {
      id: idDemo(NS.disciplina, 5),
      school_id: SCHOOL_ID,
      code: "BIO",
      name: "Biologia",
    },
    {
      id: idDemo(NS.disciplina, 6),
      school_id: SCHOOL_ID,
      code: "HST",
      name: "História",
    },
    {
      id: idDemo(NS.disciplina, 7),
      school_id: SCHOOL_ID,
      code: "GEO",
      name: "Geografia",
    },
    {
      id: idDemo(NS.disciplina, 8),
      school_id: SCHOOL_ID,
      code: "ING",
      name: "Língua Inglesa",
    },
    {
      id: idDemo(NS.disciplina, 9),
      school_id: SCHOOL_ID,
      code: "TIC",
      name: "Tecnologias de Informação",
    },
    {
      id: idDemo(NS.disciplina, 10),
      school_id: SCHOOL_ID,
      code: "EF",
      name: "Educação Física",
    },
  ];
  // created_by/updated_by são NOT NULL em subjects.
  for (const sub of subjects) {
    sub.created_by = AUTOR;
    sub.updated_by = AUTOR;
  }
  await gravar("subjects", subjects);

  console.log(
    "7. A registar Perfis Especiais (Direção, Secretaria, Tesouraria, Professores e Encarregados)...",
  );
  const staffPeople = [
    {
      id: idDemo(NS.pessoalEscola, 1),
      school_id: SCHOOL_ID,
      full_name: "Prof. Dr. Alberto Canguele",
      sex: "M",
      email: "diretor@siga-demo.ao",
      phone: "+244 923 111 222",
      national_id: "005412981LA032",
      address: "Talatona, Alvalade",
    },
    {
      id: idDemo(NS.pessoalEscola, 2),
      school_id: SCHOOL_ID,
      full_name: "Dra. Maria Esperança Coxe",
      sex: "F",
      email: "secretaria@siga-demo.ao",
      phone: "+244 923 111 223",
      national_id: "006712982LA041",
      address: "Maianga, Rua Silva Porto",
    },
    {
      id: idDemo(NS.pessoalEscola, 3),
      school_id: SCHOOL_ID,
      full_name: "Dr. João Pedro Mateus",
      sex: "M",
      email: "tesouraria@siga-demo.ao",
      phone: "+244 923 111 224",
      national_id: "007812983LA055",
      address: "Projecto Nova Vida",
    },
    {
      id: idDemo(NS.pessoalEscola, 4),
      school_id: SCHOOL_ID,
      full_name: "Prof. António Gonga",
      sex: "M",
      email: "prof.alberto@siga-demo.ao",
      phone: "+244 923 111 225",
      national_id: "008912984LA062",
      address: "Viana, Estalagem",
    },
    {
      id: idDemo(NS.pessoalEscola, 5),
      school_id: SCHOOL_ID,
      full_name: "D. Beatriz Luísa Bento",
      sex: "F",
      email: "pais.demo@siga-demo.ao",
      phone: "+244 923 111 226",
      national_id: "009012985LA073",
      address: "Kilamba Kiaxi, Palanca",
    },
  ];
  for (const pessoa of staffPeople) {
    pessoa.created_by = AUTOR;
    pessoa.updated_by = AUTOR;
  }
  await gravar("people", staffPeople);

  // Plano de propinas: `finance_invoices.fee_item_id` aponta para `fee_items`,
  // que por sua vez pende de um `fee_plans` do ano lectivo. Sem esta cadeia não
  // há factura possível — e era por isso que o lote de facturas, construído mas
  // nunca gravado, nunca deu erro nem dados.
  console.log("8. A registar o plano de propinas...");
  await gravar("fee_plans", {
    id: FEE_PLAN_ID,
    school_id: SCHOOL_ID,
    academic_year_id: YEAR_2026_ID,
    code: "PROP-2026",
    name: "Propinas 2026",
    currency_code: "AOA",
    status: "active",
  });
  await gravar("fee_items", [
    {
      id: FEE_ITEM_PROPINA,
      school_id: SCHOOL_ID,
      fee_plan_id: FEE_PLAN_ID,
      code: "PROP-MENSAL",
      name: "Propina Mensal",
      kind: "tuition",
      frequency: "monthly",
      amount: 25000,
    },
    {
      id: FEE_ITEM_MATRICULA,
      school_id: SCHOOL_ID,
      fee_plan_id: FEE_PLAN_ID,
      code: "MATRICULA",
      name: "Taxa de Matrícula",
      kind: "enrollment",
      frequency: "once",
      amount: 45000,
    },
  ]);

  // Um item de avaliação por turma × disciplina × componente. As notas dos
  // alunos apontam para estes; sem eles não há onde as pendurar.
  console.log("9. A criar itens de avaliação (MAC, NPP, NPT do 1º trimestre)...");
  const assessmentItems = [];
  const assessmentItemIds = new Map();
  for (const cg of classGroups) {
    for (let dIdx = 0; dIdx < 3; dIdx++) {
      const sub = subjects[dIdx];
      for (const componente of COMPONENTES) {
        const id = idDemo(NS.avaliacao, assessmentItems.length + 1);
        assessmentItemIds.set(`${cg.id}|${sub.id}|${componente.nome}`, id);
        assessmentItems.push({
          id,
          school_id: SCHOOL_ID,
          class_group_id: cg.id,
          subject_id: sub.id,
          term: 1,
          name: `${componente.nome} — ${sub.name}`,
          kind: componente.kind,
          component: componente.nome,
          max_score: 20,
          counts_toward_pauta: true,
          created_by: AUTOR,
          updated_by: AUTOR,
        });
      }
    }
  }
  for (let i = 0; i < assessmentItems.length; i += 250) {
    await gravar("siga_assessment_items", assessmentItems.slice(i, i + 250));
  }
  const assessmentItemId = (turmaId, subjectId, componente) =>
    assessmentItemIds.get(`${turmaId}|${subjectId}|${componente}`);

  console.log(
    `10. A gerar alunos (${classGroups.length} turmas × 32) e encarregados de educação...`,
  );
  const peopleBatch = [];
  const studentsBatch = [];
  const enrollmentsBatch = [];
  const scoresBatch = [];
  const contractsBatch = [];
  const invoicesBatch = [];

  let studentCount = 1;
  for (const cg of classGroups) {
    const classStudentLimit = 32;
    for (let s = 1; s <= classStudentLimit; s++) {
      const isFemale = Math.random() > 0.5;
      const firstName = isFemale ? randChoice(firstNamesF) : randChoice(firstNamesM);
      const lastName1 = randChoice(lastNames);
      const lastName2 = randChoice(lastNames);
      const fullName = `${firstName} ${lastName1} ${lastName2}`;
      const personId = idDemo(NS.pessoaAluno, studentCount);
      const studentId = idDemo(NS.aluno, studentCount);
      const enrollId = idDemo(NS.matricula, studentCount);
      const academicNum = `2026/${pad(studentCount, 4)}`;
      const nif = `${pad(randInt(100000, 999999), 9)}LA${pad(randInt(10, 99), 3)}`;
      const birthYear = 2026 - (9 + Math.floor(studentCount % 9));

      let status = "active";
      let enrollStatus = "active";
      if (studentCount % 28 === 0) {
        status = "suspended";
      } else if (studentCount % 35 === 0) {
        status = "transferred";
        enrollStatus = "withdrawn";
      }

      peopleBatch.push({
        id: personId,
        school_id: SCHOOL_ID,
        full_name: fullName,
        sex: isFemale ? "F" : "M",
        date_of_birth: `${birthYear}-0${randInt(1, 9)}-15`,
        phone: `+244 9${randInt(10000000, 99999999)}`,
        address: randChoice(bairros),
        national_id: nif,
        created_by: AUTOR,
        updated_by: AUTOR,
      });

      studentsBatch.push({
        id: studentId,
        school_id: SCHOOL_ID,
        person_id: personId,
        student_number: academicNum,
        status,
        created_by: AUTOR,
        updated_by: AUTOR,
      });

      enrollmentsBatch.push({
        id: enrollId,
        student_id: studentId,
        class_group_id: cg.id,
        school_id: SCHOOL_ID,
        academic_year_id: YEAR_2026_ID,
        enrollment_number: `M2026/${pad(studentCount, 4)}`,
        status: enrollStatus,
        enrolled_on: "2026-02-05",
        created_by: AUTOR,
        updated_by: AUTOR,
      });

      // Notas. `term_grades` não existe na produção: uma nota é uma linha de
      // `siga_assessment_scores` ligada ao item que lhe dá disciplina, trimestre
      // e componente (MAC/NPP/NPT). A nota vive na matrícula, não no aluno.
      for (let dIdx = 0; dIdx < 3; dIdx++) {
        const sub = subjects[dIdx];
        for (const componente of COMPONENTES) {
          scoresBatch.push({
            school_id: SCHOOL_ID,
            item_id: assessmentItemId(cg.id, sub.id, componente.nome),
            enrollment_id: enrollId,
            score: randInt(componente.min, componente.max),
            status: "draft",
            recorded_by: AUTOR,
          });
        }
      }

      // Contrato de propina por matrícula — é dele que pende a factura:
      // `finance_invoices` exige `contract_id` e `fee_item_id`, e não tem
      // `student_id`, `description` nem o estado "overdue".
      contractsBatch.push({
        id: idDemo(NS.contrato, studentCount),
        school_id: SCHOOL_ID,
        enrollment_id: enrollId,
        fee_plan_id: FEE_PLAN_ID,
        status: "active",
        created_by: AUTOR,
      });

      // Um em cada dez fica por pagar, para haver devedores nos ecrãs.
      if (studentCount % 10 === 0) {
        invoicesBatch.push({
          id: idDemo(NS.fatura, studentCount),
          school_id: SCHOOL_ID,
          contract_id: idDemo(NS.contrato, studentCount),
          fee_item_id: FEE_ITEM_PROPINA,
          invoice_number: `FT2026/${pad(studentCount, 5)}`,
          competence_month: "2026-02-01",
          amount: 25000,
          due_date: "2026-02-10",
          status: "open",
          issued_by: AUTOR,
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
    const personId = idDemo(NS.encarregado, p);
    peopleBatch.push({
      id: personId,
      school_id: SCHOOL_ID,
      full_name: `Encarregado ${firstName} ${lastName1} ${lastName2}`,
      sex: isFemale ? "F" : "M",
      phone: `+244 9${randInt(10000000, 99999999)}`,
      address: randChoice(bairros),
      national_id: `${pad(randInt(100000, 999999), 9)}LA${pad(randInt(10, 99), 3)}`,
      created_by: AUTOR,
      updated_by: AUTOR,
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
  // A ordem não é de gosto: o contrato depende da matrícula, a factura do
  // contrato, e a nota do item de avaliação.
  for (let i = 0; i < contractsBatch.length; i += chunkSize) {
    await gravar("finance_contracts", contractsBatch.slice(i, i + chunkSize));
  }
  for (let i = 0; i < invoicesBatch.length; i += chunkSize) {
    await gravar("finance_invoices", invoicesBatch.slice(i, i + chunkSize));
  }
  for (let i = 0; i < scoresBatch.length; i += chunkSize) {
    await gravar("siga_assessment_scores", scoresBatch.slice(i, i + chunkSize));
  }

  // A contagem é lida dos lotes que foram mesmo gravados. A mensagem anterior
  // dizia "propinas e pautas 100% carregados" com as duas por gravar.
  console.log(
    [
      "🎉 Escola Demo carregada:",
      `${peopleBatch.length + staffPeople.length} pessoas`,
      `${studentsBatch.length} alunos em ${classGroups.length} turmas`,
      `${enrollmentsBatch.length} matrículas`,
      `${assessmentItems.length} itens de avaliação e ${scoresBatch.length} notas`,
      `${contractsBatch.length} contratos de propina e ${invoicesBatch.length} facturas em aberto`,
      `${rooms.length} salas, ${gradeLevels.length} classes, ${programs.length} programas.`,
    ].join(" · "),
  );
}

// Só corre quando é invocado directamente. Importado (pelo teste que compara
// cada escrita com o retrato da produção), limita-se a exportar `runSeed`.
const invocadoDirectamente =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invocadoDirectamente) {
  runSeed().catch((err) => {
    console.error("❌ Erro na carga de dados:", err);
    process.exit(1);
  });
}

export { runSeed };
