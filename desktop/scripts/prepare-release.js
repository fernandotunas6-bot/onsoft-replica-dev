#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Prepare files only. Tags and published releases are managed by SIGA's release workflow.
const version = process.argv[2]?.replace(/^v/, '')
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run release:prepare -- 1.1.1')
  process.exit(1)
}
const run = (program, args, cwd = '.') => {
  const result = spawnSync(program, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
if (status.status !== 0 || status.stdout.trim()) {
  console.error('Commit or stash existing changes before preparing a release.')
  process.exit(1)
}
run('npm', ['run', 'check:all'])
for (const path of ['package.json', '../src-tauri/tauri.conf.json']) {
  const config = JSON.parse(readFileSync(path, 'utf8'))
  config.version = version
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n')
}
const cargoPath = '../src-tauri/Cargo.toml'
writeFileSync(
  cargoPath,
  readFileSync(cargoPath, 'utf8').replace(
    /^version = "[^"]+"/m,
    `version = "${version}"`
  )
)
run('npm', ['install', '--package-lock-only', '--ignore-scripts'])
run('cargo', ['update', '--manifest-path', cargoPath, '-p', 'siga-desktop'])
run('node', ['scripts/check-desktop.mjs'], '..')
run('cargo', ['check', '--manifest-path', cargoPath, '--locked'])
console.log(
  `Version ${version} prepared. Review and commit the changes, then follow ../docs/desktop/PUBLICAR_VERSOES.md. No tag or release was published.`
)
