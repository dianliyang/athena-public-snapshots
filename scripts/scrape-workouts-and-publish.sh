#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"
BUCKET_NAME="${R2_BUCKET_NAME:-athena-public-catalogs}"
MODE="legacy"
SCRAPER_ARGS=()

cd "$ROOT_DIR"

for arg in "$@"; do
  case "$arg" in
    legacy|refresh)
      MODE="$arg"
      ;;
    --bucket=*)
      BUCKET_NAME="${arg#--bucket=}"
      ;;
    *)
      SCRAPER_ARGS+=("$arg")
      ;;
  esac
done

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "[pipeline] Starting local workout pipeline"
echo "[pipeline] Output directory: $OUT_DIR"
echo "[pipeline] Mode: $MODE"
echo "[pipeline] Target R2 bucket: $BUCKET_NAME"

if [ "$MODE" = "refresh" ]; then
  R2_BUCKET_NAME="$BUCKET_NAME" npm run publish-workouts -- --mode=refresh "${SCRAPER_ARGS[@]}"
else
  echo "[pipeline] Pulling published workout detail snapshot from R2"
  R2_BUCKET_NAME="$BUCKET_NAME" npm run publish-workouts -- --mode=legacy "${SCRAPER_ARGS[@]}"
fi
echo "[pipeline] Finished local workout pipeline"
