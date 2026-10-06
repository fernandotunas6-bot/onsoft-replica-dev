#!/usr/bin/env node
/**
 * Cópias dos instaladores com nomes fixos, para o site ligar sempre à última versão
 * publicada: https://github.com/<repo>/releases/latest/download/<nome fixo>.
 *
 * O tauri-action dá aos ficheiros nomes com a versão ("SIGA Desktop_1.1.0_x64-setup.exe"),
 * que mudam a cada release. O `release-desktop.yml` passa aqui a lista `artifactPaths` do
 * tauri-action (variável ARTIFACT_PATHS) e envia as cópias para a mesma release.
 *
 * Uso: ARTIFACT_PATHS='["…/x.exe"]' node scripts/desktop/stable-assets.mjs <pasta-destino>
 * Escreve na pasta as cópias e imprime os caminhos, um por linha.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Nomes que o site (painel/web/src/lib/desktop-downloads.ts) usa nos links. */
export const STABLE_ASSET_NAMES = {
  windows: "SIGA-Desktop-Windows-x64-setup.exe",
  macos: "SIGA-Desktop-macOS-universal.dmg",
  appimage: "SIGA-Desktop-Linux-x86_64.AppImage",
  deb: "SIGA-Desktop-Linux-amd64.deb",
  rpm: "SIGA-Desktop-Linux-x86_64.rpm",
};

/** Nome fixo de um instalador, ou null para o que não é instalador (assinaturas, .tar.gz…). */
export function stableAssetName(path) {
  const name = basename(path);
  if (name.endsWith("-setup.exe")) return STABLE_ASSET_NAMES.windows;
  if (name.endsWith(".dmg")) return STABLE_ASSET_NAMES.macos;
  if (name.endsWith(".AppImage")) return STABLE_ASSET_NAMES.appimage;
  if (name.endsWith(".deb")) return STABLE_ASSET_NAMES.deb;
  if (name.endsWith(".rpm")) return STABLE_ASSET_NAMES.rpm;
  return null;
}

export function stableCopies(paths) {
  const copies = new Map();
  for (const path of paths) {
    const name = stableAssetName(path);
    if (!name) continue;
    if (copies.has(name))
      throw new Error(`Dois instaladores para ${name}: ${copies.get(name)} e ${path}`);
    copies.set(name, path);
  }
  return copies;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) throw new Error("Indique a pasta de destino.");
  const paths = JSON.parse(process.env.ARTIFACT_PATHS || "[]");
  const copies = stableCopies(paths);
  if (copies.size === 0)
    throw new Error(`Nenhum instalador em ARTIFACT_PATHS: ${paths.join(", ")}`);
  mkdirSync(target, { recursive: true });
  for (const [name, source] of copies) {
    const destination = join(target, name);
    copyFileSync(source, destination);
    console.log(destination);
  }
}
