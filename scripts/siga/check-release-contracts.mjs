import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const snapshot = JSON.parse(
  readFileSync(resolve(root, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
);
const functions = new Set(
  snapshot.funcoes.filter((item) => item.schema === "public").map((item) => item.funcao),
);
const required = ["siga_enroll_new_student_atomic", "siga_save_active_academic_year"];
const missing = required.filter((name) => !functions.has(name));
const missingPolicies = ["INSERT", "UPDATE", "DELETE"].filter(
  (command) =>
    !snapshot.politicas.some(
      (policy) =>
        policy.tabela === "staff_module_grants" &&
        policy.cmd === command &&
        policy.modo === "RESTRICTIVE" &&
        policy.papeis.includes("authenticated") &&
        (command === "INSERT" || /is_aal2\(/.test(policy.usando)) &&
        (command === "DELETE" || /is_aal2\(/.test(policy.verificando)),
    ),
);
if (missing.length || missingPolicies.length) {
  console.error(
    "Publicação bloqueada: dependências ausentes do catálogo de produção confirmado. RPCs: " +
      (missing.join(", ") || "presentes") +
      "; políticas MFA de grants: " +
      (missingPolicies.join(", ") || "presentes") +
      ". Rever/aplicar o SQL autorizado, recapturar snapshot e regenerar tipos antes de publicar.",
  );
  process.exitCode = 1;
} else {
  console.log(
    "Contratos de publicação presentes no snapshot confirmado. Rever ainda a aceitação em staging da mesma versão.",
  );
}
