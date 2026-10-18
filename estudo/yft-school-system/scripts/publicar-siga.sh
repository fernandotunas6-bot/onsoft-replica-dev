#!/usr/bin/env bash
# Publica o YFT na conta Cloudflare do SIGA: um Worker "siga-yft" que serve a
# app Flutter e a API, com D1 "siga-yft-db" e R2 "siga-yft-media".
#
#   scripts/publicar-siga.sh teste     # https://siga-yft.<conta>.workers.dev
#   scripts/publicar-siga.sh dominio   # https://m.portal-siga.com (passo 4 do PUBLICAR_SIGA.md)
#
#   MODO=siga scripts/publicar-siga.sh teste
#     App no modo SIGA: entra com as contas do SIGA e lê/grava os dados do SIGA
#     (docs/MIGRACAO_SUPABASE.md). Não precisa do Firebase.
#
# Ambiente (nunca no Git):
#   CLOUDFLARE_API_TOKEN   Workers Scripts/Routes, D1, R2 e Workers Custom Domains: Edit
#   CLOUDFLARE_ACCOUNT_ID
#   FIREBASE_WEB_API_KEY   apiKey web do projecto siga-plus-integracoes
#   SUPER_ADMIN_API_KEY    segredo partilhado com o super-admin (≥ 32 caracteres)
#   FIREBASE_SERVICE_ACCOUNT_JSON  opcional (apagar contas Firebase de encarregados)
#   SGA_SUPABASE_SECRET_KEY        chave de servidor do Supabase do SIGA, para a
#                                  API /api/sga (obrigatória com MODO=siga)
#
# Só com MODO=siga (no lugar de FIREBASE_WEB_API_KEY e SUPER_ADMIN_API_KEY):
#   HCAPTCHA_SITE_KEY      a mesma VITE_HCAPTCHA_SITE_KEY do SIGA (pública)
#   SGA_PORTAL_URL         endereço do portal do SIGA, ex.: https://portal-siga.com
#   (o domínio da app e o do portal têm de estar na lista da chave do hCaptcha)
set -euo pipefail

MODO="${MODO:-firebase}"
if [[ "$MODO" != "firebase" && "$MODO" != "siga" ]]; then
  echo "MODO tem de ser firebase ou siga." >&2
  exit 2
fi

TARGET="${1:-}"
if [[ "$TARGET" != "teste" && "$TARGET" != "dominio" ]]; then
  echo "uso: $0 teste|dominio" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER="$ROOT/school-worker"
FIREBASE_PROJECT="siga-plus-integracoes"
WRANGLER=(npx wrangler) # a versão do package-lock do school-worker

if [[ "$MODO" == "siga" ]]; then
  REQUIRED=(CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID SGA_SUPABASE_SECRET_KEY HCAPTCHA_SITE_KEY SGA_PORTAL_URL)
else
  REQUIRED=(CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID FIREBASE_WEB_API_KEY SUPER_ADMIN_API_KEY)
fi
for key in "${REQUIRED[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "$key em falta no ambiente." >&2
    exit 1
  fi
done
if [[ -n "${SUPER_ADMIN_API_KEY:-}" ]] && (( ${#SUPER_ADMIN_API_KEY} < 32 )); then
  echo "SUPER_ADMIN_API_KEY demasiado curta (mínimo 32 caracteres)." >&2
  exit 1
fi

# 1. Firebase: lib/firebase_options.dart tem de vir do flutterfire configure
#    (no modo SIGA o Firebase não arranca e não é preciso).
OPTIONS="$ROOT/lib/firebase_options.dart"
if [[ "$MODO" == "firebase" ]] && { ! grep -q "projectId: '$FIREBASE_PROJECT'" "$OPTIONS" || grep -q "YOUR_WEB_API_KEY" "$OPTIONS"; }; then
  echo "lib/firebase_options.dart não é do projecto $FIREBASE_PROJECT." >&2
  echo "Correr: dart pub global activate flutterfire_cli && flutterfire configure --project=$FIREBASE_PROJECT" >&2
  exit 1
fi

# 2. Origem pública: a app chama a API na mesma origem.
if [[ "$TARGET" == "dominio" ]]; then
  ORIGIN="https://m.portal-siga.com"
  ENV_ARGS=(--env dominio)
else
  SUBDOMAIN="$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.subdomain))')"
  ORIGIN="https://siga-yft.$SUBDOMAIN.workers.dev"
  ENV_ARGS=(--env "") # ambiente de topo, sem o domínio
fi
echo "Origem: $ORIGIN"

# 3. App Flutter (versão do autor: com 3.47 o lucide_icons não compila).
cd "$ROOT"
flutter --version | head -1 | grep -q "Flutter 3.41" || {
  echo "Usar Flutter 3.41.x (ver .metadata)." >&2
  exit 1
}
flutter pub get
DEFINES=(--dart-define=API_BASE_URL="$ORIGIN")
if [[ "$MODO" == "siga" ]]; then
  # URL e chave publicável do SGA: as mesmas do wrangler.siga.jsonc (públicas).
  read -r SGA_URL SGA_PUB < <(node -e '
    const t = require("fs").readFileSync(process.argv[1], "utf8");
    const get = (k) => (t.match(new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`)) || [])[1] || "";
    console.log(get("SGA_SUPABASE_URL"), get("SGA_SUPABASE_PUBLISHABLE_KEY"));
  ' "$WORKER/wrangler.siga.jsonc")
  if [[ -z "$SGA_URL" || -z "$SGA_PUB" ]]; then
    echo "SGA_SUPABASE_URL/PUBLISHABLE_KEY em falta no wrangler.siga.jsonc." >&2
    exit 1
  fi
  DEFINES+=(
    --dart-define=SGA_SUPABASE_URL="$SGA_URL"
    --dart-define=SGA_SUPABASE_PUBLISHABLE_KEY="$SGA_PUB"
    --dart-define=HCAPTCHA_SITE_KEY="$HCAPTCHA_SITE_KEY"
    --dart-define=SGA_PORTAL_URL="${SGA_PORTAL_URL%/}"
  )
fi
flutter build web --release --no-web-resources-cdn "${DEFINES[@]}"

# 4. Base D1 (cria na primeira vez) e configuração gerada com o id real.
cd "$WORKER"
npm ci --ignore-scripts
D1_ID="$("${WRANGLER[@]}" d1 list --json |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const db=JSON.parse(s).find(d=>d.name==="siga-yft-db");console.log(db?db.uuid:"")})')"
if [[ -z "$D1_ID" ]]; then
  "${WRANGLER[@]}" d1 create siga-yft-db
  D1_ID="$("${WRANGLER[@]}" d1 list --json |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(d=>d.name==="siga-yft-db").uuid))')"
fi
CONFIG="$WORKER/wrangler.siga.generated.jsonc"
sed "s/__D1_DATABASE_ID__/$D1_ID/g" "$WORKER/wrangler.siga.jsonc" >"$CONFIG"

"${WRANGLER[@]}" r2 bucket create siga-yft-media 2>/dev/null || true
"${WRANGLER[@]}" d1 migrations apply siga-yft-db --remote --config "$CONFIG" "${ENV_ARGS[@]}"

# 5. Publicar e gravar os segredos (lidos do ambiente, nunca escritos em disco).
"${WRANGLER[@]}" deploy --config "$CONFIG" "${ENV_ARGS[@]}"
node -e '
const s = {};
for (const k of ["FIREBASE_WEB_API_KEY", "SUPER_ADMIN_API_KEY"]) if (process.env[k]) s[k] = process.env[k];
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) s.FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (process.env.SGA_SUPABASE_SECRET_KEY) s.SGA_SUPABASE_SECRET_KEY = process.env.SGA_SUPABASE_SECRET_KEY;
process.stdout.write(JSON.stringify(s));
' | "${WRANGLER[@]}" secret bulk --config "$CONFIG" "${ENV_ARGS[@]}"

# 6. Verificação mínima.
sleep 5
curl -fsS "$ORIGIN/health" && echo
curl -fsS -o /dev/null -w "página: %{http_code}\n" "$ORIGIN/"
if [[ "$MODO" == "siga" ]]; then CHECK="$ORIGIN/api/sga/me"; else CHECK="$ORIGIN/api/students"; fi
code="$(curl -s -o /dev/null -w "%{http_code}" "$CHECK")"
echo "API sem sessão: $code (esperado 401)"
[[ "$code" == "401" ]]
if [[ "$MODO" == "siga" ]]; then
  echo "Agora: SGA_TOKEN=… WORKER_URL=$ORIGIN PORTAL_URL=${SGA_PORTAL_URL%/} node scripts/verificar-modo-siga.mjs"
fi
echo "Publicado: $ORIGIN"
