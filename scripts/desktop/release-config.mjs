#!/usr/bin/env node
/**
 * Configuração de actualizações de uma versão publicada da app desktop (Tauri).
 *
 * O workflow `release-desktop.yml` corre isto antes do `tauri build` e passa o
 * resultado com `--config src-tauri/tauri.release.conf.json` (junta-se ao
 * tauri.conf.json). A versão continua a ser a do tauri.conf.json/Cargo.toml (a tag
 * `v<versão>` tem de coincidir: scripts/check-desktop.mjs).
 *
 * `plugins.updater` + `bundle.createUpdaterArtifacts` só entram quando existem a chave
 * pública (variável `TAURI_UPDATER_PUBKEY`) e a privada (segredo
 * `TAURI_SIGNING_PRIVATE_KEY`). Sem elas a versão sai sem actualizações automáticas —
 * e a app continua a abrir: o Rust só regista o updater com esta configuração.
 *
 * Uso: UPDATER_PUBKEY=… HAS_PRIVATE_KEY=true REPO=dono/repo node scripts/desktop/release-config.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function releaseConfig({ pubkey, hasPrivateKey, repository }) {
  const key = String(pubkey ?? "").trim();
  if (!key || !hasPrivateKey) return {};
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repository ?? ""))) {
    throw new Error(`Repositório inválido para o endpoint das actualizações: "${repository}".`);
  }
  return {
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        pubkey: key,
        // O `latest.json` que o tauri-action junta à release. "latest" só conta releases
        // publicadas: os rascunhos não chegam às escolas até alguém os publicar.
        endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`],
      },
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = releaseConfig({
    pubkey: process.env.UPDATER_PUBKEY,
    hasPrivateKey: process.env.HAS_PRIVATE_KEY === "true",
    repository: process.env.REPO,
  });
  writeFileSync("src-tauri/tauri.release.conf.json", `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    `SIGA Desktop — actualizações automáticas: ${config.plugins ? "sim" : "não (sem chave de assinatura)"}`,
  );
}
