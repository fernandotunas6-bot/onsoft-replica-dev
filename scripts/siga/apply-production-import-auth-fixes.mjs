import { readFileSync, writeFileSync } from "node:fs";

// Deterministic patch runner. A branch push triggers the guarded maintenance workflows.
function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Patch não encontrado: ${label}`);
  return source.replace(from, to);
}

const wizardPath = "src/features/import/components/ImportWorkflowWizard.tsx";
let wizard = readFileSync(wizardPath, "utf8");
wizard = replaceRequired(
  wizard,
  'const IMPLEMENTED_MODULES = new Set<ImportModule>(["pessoas", "alunos"]);',
  'const IMPLEMENTED_MODULES = new Set<ImportModule>(["pessoas", "alunos", "matriculas", "notas", "pautas"]);',
  "módulos implementados",
);
wizard = replaceRequired(wizard, "const COMMIT_BATCH = 5;", "const COMMIT_BATCH = 200;", "lote de commit");
wizard = replaceRequired(
  wizard,
  "// Amostra limitada — simula até 250 linhas para não bloquear a UI num ficheiro enorme.\n      for (let guard = 0; guard < 50; guard++) {",
  "// Amostra limitada — simula até 400 linhas em dois lotes grandes, sem gravar dados.\n      for (let guard = 0; guard < 2; guard++) {",
  "limite do dry-run",
);
wizard = replaceRequired(
  wizard,
  "while (!completed && guard < 6000) {",
  "while (!completed && guard < Math.ceil(Math.max(job.total_rows, 1) / COMMIT_BATCH) + 2) {",
  "guarda da importação definitiva",
);
writeFileSync(wizardPath, wizard);

const authPath = "src/components/auth/AuthGate.tsx";
let auth = readFileSync(authPath, "utf8");
auth = replaceRequired(
  auth,
  `                      const { data: sessionData } = await supabase.auth.getSession();\n                      if (sessionData?.session) {\n                        setSession(sessionData.session);\n                      }\n                      setMfaFactorId(null);\n                      setMfaCode(\"\");`,
  `                      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();\n                      if (assurance.error) throw assurance.error;\n                      if (assurance.data?.currentLevel !== \"aal2\") {\n                        throw new Error(\"A verificação 2FA não elevou a sessão para AAL2. Tente novamente.\");\n                      }\n                      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();\n                      if (sessionError) throw sessionError;\n                      if (!sessionData.session) {\n                        throw new Error(\"A sessão não ficou disponível após a verificação 2FA.\");\n                      }\n                      localStorage.setItem(activityKey(sessionData.session.user.id), String(Date.now()));\n                      setSession(sessionData.session);\n                      setMfaFactorId(null);\n                      setMfaCode(\"\");`,
  "confirmação AAL2 após MFA",
);
writeFileSync(authPath, auth);

console.log("Patches de importação/MFA aplicados com sucesso.");
