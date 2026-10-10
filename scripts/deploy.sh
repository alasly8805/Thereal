#!/usr/bin/env bash
# =============================================================================
#  Zero-downtime production deploy for code-up.tech
# =============================================================================
# `npm run build` runs this script. It exists because building IN PLACE takes
# the site down: on 2026-09-22 a `next build` wiped the live .next for ~15 min
# and every admin panel returned 500 ("client reference manifest does not
# exist") while the old server kept serving from a half-written folder.
#
# Flow:
#   1. build into .next.staging (NEXT_DIST_DIR) -- the live .next is untouched
#   2. smoke-test the staged build on a private port (cron jobs disabled)
#   3. swap: .next -> .next.previous, .next.staging -> .next, pm2 reload
#   4. verify the live site; roll back to .next.previous automatically if not
#
# Usage:
#   npm run build                   safe build + deploy (same as below)
#   bash scripts/deploy.sh          safe build + deploy
#   bash scripts/deploy.sh --rollback   swap .next.previous back in (one step)
#
# Anywhere other than the production box (no pm2 app "Thefake" here) it falls
# back to a plain in-place build, so local builds behave as they always did.
# =============================================================================
set -Eeuo pipefail

APP_DIR=/home/ec2-user/Thefake
APP_NAME=Thefake
STAGE=.next.staging
PREV=.next.previous
LOCK_FILE=/tmp/thefake_deploy.lock     # the watchdog pauses repairs while held
LIVE_PORT=3000
SMOKE_PORT=3099
BUILD_TIMEOUT=2400                     # same cap the watchdog uses
BUILD_HEAP=3072
MIN_FREE_MB=2048
PAGES=(/ /adminpanel /adminpanel/superadmin /adminpanel/assistant /adminpanel/teacher)

if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
else
  cd "$(dirname "$0")/.."
fi
unset NEXT_DIST_DIR   # pm2 --update-env must never pick up a staging dist dir
unset TURBOPACK

# ---- not the production box: plain build, original behaviour ----------------
if [ "$(pwd -P)" != "$APP_DIR" ] || ! pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  node scripts/prisma-generate.js
  exec npx next build --webpack
fi

mkdir -p logs
LOG=logs/deploy.log
exec > >(tee -a "$LOG") 2>&1

log()  { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die()  { log "FAILED: $*"; exit 1; }

# ---- one deploy at a time ----------------------------------------------------
exec {LOCK_FD}>"$LOCK_FILE"
flock -n "$LOCK_FD" || die "another deploy is already running (lock $LOCK_FILE)"

http_code() {
  local c
  c=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 20 "http://127.0.0.1:$1$2" 2>/dev/null) || true
  echo "${c:-000}"
}

wait_health() {   # port, seconds
  local i
  for ((i = 0; i < $2; i++)); do
    [ "$(http_code "$1" /api/health)" = 200 ] && return 0
    sleep 1
  done
  return 1
}

check_pages() {   # port -- every page must answer, and none may be a 5xx
  local p c ok=0
  for p in "${PAGES[@]}"; do
    c=$(http_code "$1" "$p")
    log "  $p -> $c"
    if [ "$c" = 000 ] || [ "$c" -ge 500 ]; then ok=1; fi
  done
  return $ok
}

# Same rule as the watchdog's build_artifacts_ok: every boot-critical manifest
# must exist AND parse, or the workers exit(1) on start.
artifacts_ok() {
  local d="$1" f
  [ -s "$d/BUILD_ID" ] && [ -d "$d/server" ] || return 1
  for f in routes-manifest.json required-server-files.json prerender-manifest.json; do
    jq -e . "$d/$f" >/dev/null 2>&1 || return 1
  done
}

reload_app() { pm2 reload "$APP_NAME" --update-env >/dev/null; }

verify_live() {
  wait_health "$LIVE_PORT" 90 && check_pages "$LIVE_PORT"
}

# ---- --rollback: put the previous build back ---------------------------------
if [ "${1:-}" = "--rollback" ]; then
  artifacts_ok "$PREV" || die "no usable $PREV to roll back to"
  log "rolling back: $(cat .next/BUILD_ID 2>/dev/null) -> $(cat "$PREV/BUILD_ID")"
  rm -rf .next.rolledback
  mv .next .next.rolledback
  mv "$PREV" .next
  mv .next.rolledback "$PREV"       # so a second --rollback undoes this one
  reload_app
  verify_live || die "site unhealthy after rollback -- check 'pm2 logs $APP_NAME'"
  log "rollback OK, live BUILD_ID $(cat .next/BUILD_ID)"
  exit 0
fi

# ---- cleanup on any exit -----------------------------------------------------
SMOKE_PID=""
cp -p tsconfig.json /tmp/thefake-deploy-tsconfig.json
cp -p next-env.d.ts /tmp/thefake-deploy-next-env.d.ts
cleanup() {
  set +e
  [ -n "$SMOKE_PID" ] && kill "$SMOKE_PID" 2>/dev/null && wait "$SMOKE_PID" 2>/dev/null
  # next build rewrites these to mention .next.staging; keep git clean
  cp -p /tmp/thefake-deploy-tsconfig.json tsconfig.json 2>/dev/null || true
  cp -p /tmp/thefake-deploy-next-env.d.ts next-env.d.ts 2>/dev/null || true
  rm -rf "$STAGE"
}
trap cleanup EXIT

START=$(date +%s)
log "=== deploy started (live BUILD_ID $(cat .next/BUILD_ID 2>/dev/null || echo none)) ==="

# ---- 1. pre-flight -----------------------------------------------------------
free_mb=$(df -Pm . | awk 'NR==2{print $4}')
[ "$free_mb" -ge "$MIN_FREE_MB" ] || die "only ${free_mb}MB disk free, need ${MIN_FREE_MB}MB"
log "disk free ${free_mb}MB, memory avail $(awk '/MemAvailable/{printf "%d", $2/1024}' /proc/meminfo)MB"

# ---- 2. build into the staging folder ----------------------------------------
rm -rf "$STAGE"
mkdir -p "$STAGE"
# Hard-link the webpack cache: warm incremental build, zero extra disk.
[ -d .next/cache ] && cp -al .next/cache "$STAGE/cache"

log "prisma generate"
node scripts/prisma-generate.js

log "next build -> $STAGE (the live site keeps serving from .next)"
NEXT_DIST_DIR="$STAGE" NODE_OPTIONS="--max-old-space-size=$BUILD_HEAP" \
  timeout "$BUILD_TIMEOUT" npx next build --webpack || die "next build failed -- live site untouched"
artifacts_ok "$STAGE" || die "build finished but artifacts are incomplete -- live site untouched"
# The watchdog does the same after its own rebuilds (Next 16 emits proxy.js).
[ -f "$STAGE/server/proxy.js" ] && [ ! -e "$STAGE/server/middleware.js" ] \
  && ln -s proxy.js "$STAGE/server/middleware.js"
log "build OK, new BUILD_ID $(cat "$STAGE/BUILD_ID")"

# ---- 3. smoke-test the staged build on a private port ------------------------
log "smoke test on :$SMOKE_PORT"
NODE_ENV=production NEXT_DIST_DIR="$STAGE" PORT="$SMOKE_PORT" HOSTNAME=127.0.0.1 \
  NODE_APP_INSTANCE=1 \
  node --max-old-space-size=768 server.js > logs/deploy-smoke.log 2>&1 &
SMOKE_PID=$!
wait_health "$SMOKE_PORT" 120 || die "staged build never became healthy (logs/deploy-smoke.log) -- live site untouched"
check_pages "$SMOKE_PORT"     || die "staged build returned errors (logs/deploy-smoke.log) -- live site untouched"
kill "$SMOKE_PID" 2>/dev/null; wait "$SMOKE_PID" 2>/dev/null || true; SMOKE_PID=""

# ---- 4. swap and reload ------------------------------------------------------
log "swapping builds and reloading $APP_NAME"
rm -rf "$PREV"
[ -d .next ] && mv .next "$PREV" || mkdir -p "$PREV"
mv "$STAGE" .next
reload_app

# ---- 5. verify live, roll back automatically if unhealthy --------------------
if ! verify_live; then
  log "live site unhealthy after swap -- rolling back to $(cat "$PREV/BUILD_ID")"
  rm -rf .next.failed
  mv .next .next.failed
  mv "$PREV" .next
  reload_app
  verify_live && die "new build rejected; previous build restored and serving (bad build kept in .next.failed)"
  die "rollback also unhealthy -- check 'pm2 logs $APP_NAME' NOW"
fi

# The previous build is only a rollback target; its 700MB webpack cache now
# lives on in .next/cache, so drop the duplicate.
rm -rf "$PREV/cache"
rm -rf .next.failed
log "=== deploy OK in $(( $(date +%s) - START ))s, live BUILD_ID $(cat .next/BUILD_ID) (rollback: bash scripts/deploy.sh --rollback) ==="
