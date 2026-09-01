import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Load env
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const projectRef = process.env.SUPABASE_PROJECT_ID || "xodgfmxiaunpamctfeea";
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error("ERRO: SUPABASE_ACCESS_TOKEN não encontrado no ambiente.");
  process.exit(1);
}

async function executeSql(sql, label = "SQL") {
  console.log(`\n⏳ A executar [${label}] em ${projectRef}...`);
  const start = Date.now();
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  });

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  if (!res.ok) {
    const errText = await res.text();
    console.error(`❌ Erro em [${label}] (${duration}s): HTTP ${res.status}\n${errText}`);
    throw new Error(`Failed to execute ${label}: HTTP ${res.status}: ${errText}`);
  }

  const result = await res.json().catch(() => null);
  console.log(`✅ Sucesso em [${label}] (${duration}s)`);
  return result;
}

async function run() {
  console.log("=========================================================");
  console.log("   SIGA Plus — Execução Automática de SQL no Supabase   ");
  console.log(`   Project Ref: ${projectRef}`);
  console.log("=========================================================");

  // 0. Ensure helper function current_profile_role() exists
  const helperSql = `
    CREATE OR REPLACE FUNCTION public.current_profile_role()
    RETURNS text
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
      SELECT COALESCE(
        (
          SELECT r.code
          FROM public.school_memberships sm
          JOIN public.member_roles mr ON mr.membership_id = sm.id
          JOIN public.roles r ON r.id = mr.role_id
          WHERE sm.user_id = (SELECT auth.uid())
            AND sm.status = 'active'
          ORDER BY sm.created_at ASC
          LIMIT 1
        ),
        (
          SELECT cargo
          FROM public.profiles
          WHERE id = (SELECT auth.uid())
          LIMIT 1
        ),
        'Utilizador'
      );
    $$;
    REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;
  `;
  await executeSql(helperSql, "0. Helper: current_profile_role()");

  // 1. APPLY_IN_SQL_EDITOR.sql
  const file1 = resolve(root, "supabase/APPLY_IN_SQL_EDITOR.sql");
  if (existsSync(file1)) {
    const sql1 = readFileSync(file1, "utf8");
    await executeSql(sql1, "1. supabase/APPLY_IN_SQL_EDITOR.sql");
  }

  // 2. APPLY_ENROLLMENT_AND_PREMIUM.sql
  const file2 = resolve(root, "supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql");
  if (existsSync(file2)) {
    const sql2 = readFileSync(file2, "utf8");
    await executeSql(sql2, "2. supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql");
  }

  // 3. APPLY_SAAS_PLATFORM.sql
  const file3 = resolve(root, "supabase/APPLY_SAAS_PLATFORM.sql");
  if (existsSync(file3)) {
    const sql3 = readFileSync(file3, "utf8");
    await executeSql(sql3, "3. supabase/APPLY_SAAS_PLATFORM.sql");
  }

  // 4. APPLY_MISSING_FROM_VERIFY.sql
  const file4 = resolve(root, "supabase/APPLY_MISSING_FROM_VERIFY.sql");
  if (existsSync(file4)) {
    const sql4 = readFileSync(file4, "utf8");
    await executeSql(sql4, "4. supabase/APPLY_MISSING_FROM_VERIFY.sql");
  }

  // 5. APPLY_PERFORMANCE_INDEXES.sql
  const file5 = resolve(root, "supabase/APPLY_PERFORMANCE_INDEXES.sql");
  if (existsSync(file5)) {
    const sql5 = readFileSync(file5, "utf8");
    await executeSql(sql5, "5. supabase/APPLY_PERFORMANCE_INDEXES.sql");
  }

  // 6. APPLY_DIGITAL_IDENTITY.sql
  const file6 = resolve(root, "supabase/APPLY_DIGITAL_IDENTITY.sql");
  if (existsSync(file6)) {
    const sql6 = readFileSync(file6, "utf8");
    await executeSql(sql6, "6. supabase/APPLY_DIGITAL_IDENTITY.sql");
  }

  // 7. Reload PostgREST schema cache
  await executeSql("NOTIFY pgrst, 'reload schema';", "7. Reload PostgREST schema cache");

  console.log("\n=========================================================");
  console.log("   Execução concluída com sucesso!                      ");
  console.log("=========================================================\n");
}

run().catch(err => {
  console.error("\n❌ Falha na execução do SQL:", err);
  process.exit(1);
});
