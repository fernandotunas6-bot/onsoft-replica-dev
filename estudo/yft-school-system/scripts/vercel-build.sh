#!/usr/bin/env bash
# Vercel Linux build: install Flutter into VERCEL_CACHE_DIR (persisted), then web release.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CACHE_ROOT="${VERCEL_CACHE_DIR:-$HOME/.vercel-cache}"
FLUTTER_HOME="${CACHE_ROOT}/flutter-sdk-stable"
export PATH="${FLUTTER_HOME}/bin:${PATH}"

mkdir -p "$CACHE_ROOT"

if [[ ! -x "${FLUTTER_HOME}/bin/flutter" ]]; then
  echo "Installing Flutter stable to ${FLUTTER_HOME}..."
  rm -rf "$FLUTTER_HOME"
  git clone https://github.com/flutter/flutter.git -b stable --depth 1 "$FLUTTER_HOME"
fi

flutter --version
flutter config --no-analytics --enable-web
flutter precache --web
flutter pub get

DEF_ARGS=()
if [[ -n "${API_BASE_URL:-}" ]]; then
  DEF_ARGS+=(--dart-define="API_BASE_URL=${API_BASE_URL}")
  echo "Using API_BASE_URL from Vercel environment."
else
  echo "Using compile-time default API_BASE_URL (see lib/core/network/api_client.dart)."
fi

flutter build web --release "${DEF_ARGS[@]}"

echo "Done. Output: build/web"
