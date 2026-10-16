#!/usr/bin/env bash
# Grava as respostas reais do worker (test/contract.spec.ts) em
# ../test/contract/fixtures/, onde os testes Dart verificam que os modelos
# do app as lêem. Correr depois de mudar a forma de uma resposta.
set -euo pipefail
cd "$(dirname "$0")/.."
out="../test/contract/fixtures"
mkdir -p "$out"
CONTRACT_DUMP=1 npx vitest run test/contract.spec.ts --disableConsoleIntercept 2>/dev/null \
  | sed -n 's/^.*CONTRACT_FIXTURES=//p' \
  | node -e '
    const fs = require("fs");
    const all = JSON.parse(fs.readFileSync(0, "utf8"));
    for (const [name, value] of Object.entries(all)) {
      fs.writeFileSync(`${process.argv[1]}/${name}.json`, JSON.stringify(value, null, 2) + "\n");
    }
    console.log(`${Object.keys(all).length} respostas gravadas em ${process.argv[1]}`);
  ' "$out"
