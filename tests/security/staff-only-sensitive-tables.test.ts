import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mapAppRoleToSgaCodes } from "@/integrations/supabase/sga";

/**
 * Duas migrações de 2026-09-30, verificadas contra o retrato da produção e as
 * definições de funções versionadas:
 *
 *  - 20260930120000: EXECUTE nas funções privadas das pautas oficiais (a árvore
 *    de chamadas inteira, não só o topo);
 *  - 20260930130000: política RESTRICTIVE «School staff only» nas tabelas com
 *    dados de alunos, notas, faltas, pagamentos, documentos e importações.
 *
 * O segundo bloco não confia numa lista escrita à mão: deriva do retrato as
 * tabelas que alunos/encarregados conseguiam ler e exige que todas estejam
 * cobertas (ou justificadas).
 */

const REPO = resolve(__dirname, "../..");
const MIGRATIONS = resolve(REPO, "supabase/migrations");
const read = (name: string) => readFileSync(resolve(MIGRATIONS, name), "utf8");
const stripComments = (sql: string) => sql.replace(/--.*$/gm, "");

const GRANTS_SQL = stripComments(read("20260930120000_grade_sheet_functions_execute.sql"));
const STAFF_SQL = stripComments(read("20260930130000_sensitive_tables_school_staff_only.sql"));

type Policy = {
  tabela: string;
  politica: string;
  cmd: string;
  papeis: string;
  usando: string;
  verificando: string;
};
type Snapshot = {
  tabelas: Array<{ tabela: string; colunas: string[] }>;
  politicas: Policy[];
};
const snapshot = JSON.parse(
  readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as Snapshot;

/** Última definição versionada de uma função private.* (por ordem dos ficheiros). */
function latestPrivateDefinition(name: string): string | null {
  let found: string | null = null;
  const header = new RegExp(`CREATE OR REPLACE FUNCTION private\\.${name}\\(`, "i");
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(resolve(MIGRATIONS, file), "utf8");
    const start = sql.search(header);
    if (start < 0) continue;
    const rest = sql.slice(start);
    const end = rest.search(/\$function\$;|\$\$;/);
    found = end > 0 ? rest.slice(0, end) : rest;
  }
  return found;
}

describe("pautas oficiais: EXECUTE nas funções privadas", () => {
  const granted = [...GRANTS_SQL.matchAll(/'private\.(\w+)\(/g)].map((m) => m[1]!);
  // Executáveis por `authenticated` na produção a 2026-09-30 (consultado).
  const ALREADY_EXECUTABLE = new Set(["has_permission", "is_aal2", "archive_grade_sheet_version"]);

  it("dá EXECUTE só a authenticated, nunca a anon/PUBLIC", () => {
    expect(GRANTS_SQL).toMatch(/GRANT EXECUTE ON FUNCTION %s TO authenticated'/);
    expect(GRANTS_SQL).not.toMatch(/GRANT[^;']*\b(anon|PUBLIC)\b/);
    expect(GRANTS_SQL).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon/);
  });

  it("cobre toda a árvore de chamadas de build_grade_sheet e transition_grade_sheet", () => {
    const missing: string[] = [];
    const seen = new Set<string>();
    const visit = (fn: string) => {
      if (seen.has(fn)) return;
      seen.add(fn);
      const body = latestPrivateDefinition(fn);
      expect(body, `definição versionada de private.${fn}`).not.toBeNull();
      if (!granted.includes(fn) && !ALREADY_EXECUTABLE.has(fn)) missing.push(fn);
      // SECURITY DEFINER corre como o dono: o que chama não precisa de GRANT.
      if (/SECURITY DEFINER/i.test(body!)) return;
      const header = body!.indexOf("$function$") >= 0 ? body!.indexOf("$function$") : 0;
      for (const m of body!.slice(header).matchAll(/private\.(\w+)\s*\(/g)) visit(m[1]!);
    };
    visit("build_grade_sheet");
    visit("transition_grade_sheet");
    expect(missing).toEqual([]);
    expect([...seen].sort()).toEqual(
      [
        "archive_grade_sheet_version",
        "build_grade_sheet",
        "compute_subject_averages",
        "has_permission",
        "is_aal2",
        "round_grade",
        "transition_grade_sheet",
      ].sort(),
    );
  });

  it("as funções de topo verificam aal2 e permissão antes de mexer em dados", () => {
    for (const fn of ["build_grade_sheet", "transition_grade_sheet"]) {
      const body = latestPrivateDefinition(fn)!;
      expect(body, fn).not.toMatch(/SECURITY DEFINER/i);
      expect(body, fn).toMatch(/private\.is_aal2\(\)/);
      expect(body, fn).toMatch(/private\.has_permission\(/);
    }
  });
});

describe("tabelas sensíveis: só o pessoal da escola pela API", () => {
  const restricted = new Set([...STAFF_SQL.matchAll(/^\s*'([a-z_]+)',?\s*$/gm)].map((m) => m[1]!));
  const importArray = STAFF_SQL.match(
    /FOREACH t IN ARRAY ARRAY\[('[a-z_]+'(?:, '[a-z_]+')*)\] LOOP/,
  );
  for (const m of importArray?.[1]?.matchAll(/'([a-z_]+)'/g) ?? []) restricted.add(m[1]!);

  it("«pessoal» usa exactamente os códigos que a app mapeia para pessoal", () => {
    const helper = STAFF_SQL.match(/lower\(btrim\(r\.code\)\) IN \(([^)]*)\)/)?.[1] ?? "";
    const codes = [...helper.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!).sort();
    const expected = (["Administrador", "Secretaria", "Tesouraria", "Professor"] as const)
      .flatMap((role) => mapAppRoleToSgaCodes(role))
      .sort();
    expect(codes).toEqual(expected);
    for (const role of ["Aluno", "Encarregado"] as const) {
      for (const code of mapAppRoleToSgaCodes(role)) expect(codes).not.toContain(code);
    }
  });

  it("o helper é SECURITY DEFINER com search_path vazio e sem EXECUTE para anon", () => {
    expect(STAFF_SQL).toMatch(
      /CREATE OR REPLACE FUNCTION private\.is_school_staff\(p_school_id uuid\)[\s\S]*SECURITY DEFINER\s+SET search_path = ''/,
    );
    expect(STAFF_SQL).toMatch(
      /REVOKE ALL ON FUNCTION private\.is_school_staff\(uuid\) FROM PUBLIC, anon;/,
    );
    expect(STAFF_SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.is_school_staff\(uuid\) TO authenticated/,
    );
  });

  it("as políticas são RESTRICTIVE, FOR ALL, com USING e WITH CHECK", () => {
    const creates = [
      ...STAFF_SQL.matchAll(/'CREATE POLICY "School staff only"[\s\S]*?,\s*t\s*\)/g),
    ];
    expect(creates.length).toBe(2);
    for (const c of creates) {
      expect(c[0]).toMatch(/AS RESTRICTIVE FOR ALL TO authenticated/);
      expect(c[0]).toMatch(/USING \(/);
      expect(c[0]).toMatch(/WITH CHECK \(/);
    }
    expect(STAFF_SQL).toMatch(/DROP POLICY IF EXISTS "School staff only" ON public\.%I/);
  });

  it("todas as tabelas existem na produção com a coluna usada na condição", () => {
    const byName = new Map(snapshot.tabelas.map((t) => [t.tabela, t]));
    for (const table of restricted) {
      const t = byName.get(table);
      expect(t, table).toBeDefined();
      const column =
        table === "import_rows" || table === "import_audits" ? "import_job_id" : "school_id";
      expect(t!.colunas, table).toContain(column);
    }
  });

  /**
   * Permissões que os papéis `student`/`guardian` tinham na produção a
   * 2026-09-30 (consulta a role_permissions). As estruturais (anos, turmas,
   * horários, avisos, caixa de entrada) não expõem dados de outros alunos.
   */
  const STUDENT_GUARDIAN_PERMISSIONS = [
    "academic.classes.read",
    "academic.structure.read",
    "academic.timetable.read",
    "assessment.grades.read",
    "assessment.reports.read",
    "attendance.records.read",
    "communication.announcements.read",
    "communication.inbox.read",
    "documents.issued.read",
    "documents.requests.manage",
    "documents.requests.read",
    "finance.contracts.read",
    "finance.invoices.read",
    "students.records.read",
  ];
  const STRUCTURAL = new Set([
    "academic.classes.read",
    "academic.structure.read",
    "academic.timetable.read",
    "communication.announcements.read",
    "communication.inbox.read",
  ]);

  it("cobre toda a tabela que um aluno/encarregado lia ou alterava por permissão", () => {
    const uncovered = new Set<string>();
    for (const p of snapshot.politicas) {
      const expr = `${p.usando} ${p.verificando}`;
      const used = [...expr.matchAll(/has_permission\(school_id, '([\w.]+)'/g)].map((m) => m[1]!);
      const risky = used.some(
        (perm) => STUDENT_GUARDIAN_PERMISSIONS.includes(perm) && !STRUCTURAL.has(perm),
      );
      if (risky && !restricted.has(p.tabela)) uncovered.add(`${p.tabela}:${p.politica}`);
    }
    expect([...uncovered].sort()).toEqual([]);
  });

  /** Leituras «qualquer membro» que ficam, e porquê. */
  const MEMBER_READ_OK: Record<string, string> = {
    announcements: "avisos da escola",
    school_announcements: "avisos da escola",
    enrollment_forms: "formulário público de matrícula",
    hr_departments: "estrutura (nomes de departamentos)",
    hr_positions: "estrutura (nomes de cargos)",
    member_roles: "papéis; políticas de avatares e catálogo dependem desta leitura",
    role_permissions: "matriz de permissões",
    roles: "nomes dos papéis",
    school_memberships: "ids e estado; políticas de avatares e catálogo dependem desta leitura",
    school_settings: "definições da escola",
    schools: "a própria escola",
    siga_assessment_items: "nomes e cotações das provas, sem notas",
    siga_lesson_meetings: "ligações das aulas da turma",
    terms: "calendário",
  };
  /** Passaram a só-servidor por migração posterior ao retrato. */
  const SERVER_ONLY_LATER: Record<string, string> = {
    student_academic_history: "20260927090000_student_history_server_only.sql",
    student_status_history: "20260927090000_student_history_server_only.sql",
    siga_turnstile_devices: "20260929230000_turnstile_devices_server_only.sql",
  };

  it("nenhuma leitura «qualquer membro» fica em tabela sensível", () => {
    const memberOnly = snapshot.politicas.filter(
      (p) =>
        (p.cmd === "SELECT" || p.cmd === "ALL") &&
        /is_school_member|is_active_member/.test(p.usando) &&
        !/is_school_office|is_school_admin|sga_app_role|has_permission|auth\.uid|teacher|current_user_can|is_school_finance/.test(
          p.usando,
        ),
    );
    const unjustified = memberOnly
      .map((p) => p.tabela)
      .filter((t) => !restricted.has(t) && !(t in MEMBER_READ_OK) && !(t in SERVER_ONLY_LATER));
    expect([...new Set(unjustified)].sort()).toEqual([]);
    for (const [table, file] of Object.entries(SERVER_ONLY_LATER)) {
      expect(read(file), table).toMatch(
        new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`),
      );
    }
  });

  it("as tabelas que o painel lê com o JWT ficam legíveis por todo o pessoal", () => {
    // getSchoolTodayOps: Administrador, Secretaria, Tesouraria, Professor.
    for (const table of ["siga_attendance_sessions", "siga_assessment_scores", "import_jobs"]) {
      expect(restricted.has(table), table).toBe(true);
    }
    expect(STAFF_SQL).toMatch(/'treasury', 'tesouraria', 'finance'/);
    expect(STAFF_SQL).toMatch(/'teacher', 'professor'/);
  });

  it("retira a leitura «qualquer membro» dos planos de pagamento", () => {
    expect(STAFF_SQL).toMatch(
      /DROP POLICY IF EXISTS "Members read finance_payment_plans" ON public\.finance_payment_plans;/,
    );
  });
});

describe("políticas duplicadas", () => {
  it("nenhuma tabela tem duas políticas com o mesmo comando, papéis, modo e expressões", () => {
    // 20260930170000 retirou cinco cópias exactas de `is_school_member`; uma cópia
    // não muda o acesso, só duplica o custo por linha e esconde qual é a versionada.
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const p of snapshot.politicas as Array<Policy & { modo?: string }>) {
      const key = [p.tabela, p.cmd, p.papeis, p.modo ?? "", p.usando, p.verificando].join("\u0000");
      const other = seen.get(key);
      if (other) duplicates.push(`${p.tabela}: «${other}» = «${p.politica}»`);
      else seen.set(key, p.politica);
    }
    expect(duplicates).toEqual([]);
  });
});

describe("escrita com 2FA", () => {
  const writes = (snapshot.politicas as Array<Policy & { modo?: string }>).filter(
    (p) => p.cmd !== "SELECT" && p.modo !== "RESTRICTIVE",
  );
  const needsMfa = (p: Policy) => /is_aal2\(\)/.test(`${p.usando} ${p.verificando}`);

  it("onde uma política de escrita exige aal2, nenhuma outra do mesmo comando a dispensa", () => {
    // 20260930180000: as antigas «Create/Update … in own school» (só is_school_office)
    // somavam-se às actuais com aal2 e anulavam o 2FA na API REST.
    const bypass: string[] = [];
    for (const p of writes.filter((w) => !needsMfa(w))) {
      const covers = (cmd: string) => cmd === p.cmd || cmd === "ALL" || p.cmd === "ALL";
      if (writes.some((w) => w.tabela === p.tabela && covers(w.cmd) && needsMfa(w))) {
        bypass.push(`${p.tabela}: ${p.politica} (${p.cmd})`);
      }
    }
    expect(bypass).toEqual([]);
  });

  it("alunos e matrículas não aceitam inserção directa pela API", () => {
    const inserts = writes
      .filter((p) => ["students", "enrollments"].includes(p.tabela))
      .filter((p) => p.cmd === "INSERT" || p.cmd === "ALL")
      .map((p) => `${p.tabela}: ${p.politica}`);
    expect(inserts).toEqual([]);
  });
});
