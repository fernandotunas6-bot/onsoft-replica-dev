/**
 * App móvel (m.portal-siga.com) → public/mobile/, antes do build do portal.
 * Usa as dependências da raiz; o deploy (deploy-cf.mjs) chama isto primeiro,
 * para os ficheiros seguirem nos assets do mesmo Worker.
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public/mobile");

execSync("npx vite build --config mobile-v4/vite.portal.config.ts", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});
// Worker do preview isolado no Pages: não pertence a esta publicação.
rmSync(path.join(out, "_worker.js"), { force: true });
execSync(`node mobile-v4/scripts/pwa.mjs ${JSON.stringify(out)}`, { cwd: root, stdio: "inherit" });
