#!/usr/bin/env node
/**
 * Inventário estático da superfície escolar que ainda depende de TanStack Start
 * e do servidor. NÃO converte SSR em cliente local nem empacota dados privados.
 * Executar na raiz: node scripts/desktop/offline-inventory.mjs [--json|--check]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function filesRecursively(directory) {
  if (!existsSync(directory)) return [];
  const items = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) items.push(...filesRecursively(absolute));
    else if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      items.push(absolute);
    }
  }
  return items.sort();
}

function contents(root, path) {
  return readFileSync(resolve(root, path), "utf8");
}

/** Análise apenas de código fonte, com contagens heurísticas (não parser AST). */
export function inventoryOfflineReadiness(root = repositoryRoot) {
  const routes = filesRecursively(resolve(root, "src/routes"));
  const sources = filesRecursively(resolve(root, "src"));
  const desktopVite = contents(root, "desktop/vite.config.ts");
  const nativeSchool = contents(root, "src-tauri/src/school/mod.rs");
  const nativeConfig = JSON.parse(contents(root, "src-tauri/tauri.conf.json"));
  const remoteCapability = JSON.parse(contents(root, "src-tauri/capabilities/school-portal.json"));
  const webVite = contents(root, "vite.config.ts");

  const routeData = routes.map((absolute) => {
    const path = relative(root, absolute).replaceAll("\\", "/");
    const source = readFileSync(absolute, "utf8");
    return {
      path,
      api: path.startsWith("src/routes/api/"),
      directServerFunction: /\\bcreateServerFn\\s*\\(/.test(source),
      serverModuleImport: /(?:from\\s*|import\\s*\\()[\"'][^"'\\n]*\\/(?:server|server-legacy|server-secure-legacy)(?:[\"']|\\b)/.test(source),
      serverHandler: /\\bcreateAPIFileRoute\\s*\\(|\\bserver:\\s*\\{/.test(source),
    };
  });
  const fnModules = sources
    .filter((absolute) => /\\bcreateServerFn\\s*\\(/.test(readFileSync(absolute, "utf8")))
    .map((absolute) => relative(root, absolute).replaceAll("\\", "/"));

  const schoolWindowRemote = /WebviewUrl::External\\s*\\(/.test(nativeSchool) &&
    nativeSchool.includes("https://portal-siga.com");
  const schoolBundleEntry = /(?:school|escola)[\"']?\\s*:\\s*resolve\\s*\\(/.test(desktopVite);
  const localEntryPoints = [...desktopVite.matchAll(/^[ \\t]*[\"']?([\\w-]+)[\"']?\\s*:\\s*resolve\\s*\\(/gm)]
    .map((match) => match[1]);
  const report = {
    format: "siga-desktop-offline-inventory-v1",
    schoolRuntime: {
      remoteWindow: schoolWindowRemote,
      allowedRemoteOrigins: remoteCapability.remote?.urls ?? [],
      localEntrypoints: localEntryPoints,
      schoolBundleEntry,
      frontendDistribution: nativeConfig.build.frontendDist,
      webServerPresetCloudflare: webVite.includes("cloudflare-module"),
    },
    counts: {
      routeFiles: routeData.length,
      apiRoutes: routeData.filter((r) => r.api).length,
      otherRoutes: routeData.filter((r) => !r.api).length,
      routeFilesWithDirectServerFn: routeData.filter((r) => r.directServerFunction).length,
      routeFilesImportingServerModules: routeData.filter((r) => r.serverModuleImport).length,
      routeFilesWithServerHandlers: routeData.filter((r) => r.serverHandler).length,
      filesDefiningServerFunctions: fnModules.length,
    },
    // A lista permite abrir e refactorizar os ficheiros reais, sem inventar rotas locais.
    candidatesForAudit: routeData
      .filter((r) => !r.api && (r.directServerFunction || r.serverModuleImport || r.serverHandler))
      .map((r) => r.path),
    serverFunctionModules: fnModules,
  };
  return report;
}

export function verifyOfflineInventory(report) {
  const failures = [];
  if (report.counts.routeFiles < 1) failures.push("As rotas escolares não foram encontradas.");
  if (!report.schoolRuntime.remoteWindow) {
    failures.push("O modo de janela escolar divergiu do inventário remoto existente: rever a migração.");
  }
  if (report.schoolRuntime.schoolBundleEntry) {
    failures.push("Entrada de bundle escolar local detectada; rever paridade de autenticação, dados e capabilities.");
  }
  if (
    JSON.stringify(report.schoolRuntime.allowedRemoteOrigins) !==
    JSON.stringify(["https://portal-siga.com/*"])
  ) failures.push("A capability do portal remoto deixou de ser de origem única.");
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = inventoryOfflineReadiness();
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    console.log("SIGA Desktop — inventário de dependências offline");
    console.log(JSON.stringify(report.schoolRuntime, null, 2));
    console.log(JSON.stringify(report.counts, null, 2));
    console.log("Módulos com server functions:", report.serverFunctionModules.length);
  }
  if (process.argv.includes("--check")) {
    const failures = verifyOfflineInventory(report);
    if (failures.length) {
      for (const failure of failures) console.error("FALHA:", failure);
      process.exitCode = 1;
    }
  }
}
