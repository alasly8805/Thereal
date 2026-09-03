#!/usr/bin/env bash
# ==============================================================================
# Code-UP Autonomous Server Watchdog  --  v2  ("140 possibilities")
# ==============================================================================
# Runs every 2 minutes from cron (see bottom of file for the exact crontab).
#
# It probes 140 distinct failure modes across PM2, HTTP, the Next.js build,
# Prisma / PostgreSQL, disk / filesystem, memory / CPU / kernel, networking,
# system services, cron and git.  When something is broken it repairs it
# ITSELF -- no human confirmation, ever.  Remediation is tiered from cheapest
# (remove a stale lock) to most drastic (stop the cluster and rebuild).  It
# NEVER reboots the OS: on 2026-09-02 an OS reboot turned a missing .next build
# into an infinite reboot loop (see the escalation section).  Every drastic
# action is rate-limited so the box can never get stuck in a repair loop.
#
# Nothing here is interactive.  Every command has a timeout, every failure is
# swallowed and logged.  Safe to run back-to-back; a flock guarantees one at a
# time.
#
# Optional alerting: if the .env file defines WATCHDOG_SNS_TOPIC_ARN and/or
# WATCHDOG_WEBHOOK_URL, recovery/critical events are pushed there best-effort.
#
# Files it owns:
#   logs/watchdog.log            rolling human log
#   logs/watchdog-events.log     one line per recovery / critical event
#   logs/watchdog-status.json    machine-readable snapshot of the last run
#   logs/watchdog/               counters, cooldown stamps, cached values
# ==============================================================================

set -u

APP_DIR="/home/ec2-user/Thefake"
LOG_FILE="$APP_DIR/logs/watchdog.log"
EVENT_LOG="$APP_DIR/logs/watchdog-events.log"
STATUS_JSON="$APP_DIR/logs/watchdog-status.json"
STATE_DIR="$APP_DIR/logs/watchdog"
LOCK_FILE="/tmp/thefake_watchdog.lock"
HEALTH_URL="http://127.0.0.1:3000/api/health"
HOME_URL="http://127.0.0.1:3000"
PUBLIC_HOST="code-up.tech"
MAX_LOG_LINES=6000
EXPENSIVE_TTL=1800          # seconds to cache du / dmesg-scan style probes

export HOME="/home/ec2-user"
export USER="ec2-user"
export PATH="/home/ec2-user/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:$PATH"
export NODE_OPTIONS="--max-old-space-size=2048"
export PGCONNECT_TIMEOUT=5
export AWS_PAGER=""

mkdir -p "$APP_DIR/logs" "$STATE_DIR"
cd "$APP_DIR" 2>/dev/null || { echo "watchdog: cannot cd $APP_DIR"; exit 1; }

# ---- single instance ---------------------------------------------------------
# {WDLOCK}> lets bash pick the fd AND marks it close-on-exec, so daemons we spawn
# later (notably a fresh PM2 God) never inherit and pin the lock.
exec {WDLOCK}>"$LOCK_FILE" || exit 0
flock -n "$WDLOCK" || exit 0

# ---- logging -----------------------------------------------------------------
log() { printf '[%s] [%s] %s\n' "$(date '+%F %T')" "$1" "$2" | tee -a "$LOG_FILE" >/dev/null; }
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)" -gt "$MAX_LOG_LINES" ]; then
  tail -n 2500 "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

# ---- optional alert channels (read straight from .env, no sourcing) ----------
env_val() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"; }
WATCHDOG_SNS_TOPIC_ARN="$(env_val WATCHDOG_SNS_TOPIC_ARN)"
WATCHDOG_WEBHOOK_URL="$(env_val WATCHDOG_WEBHOOK_URL)"

notify() {
  local subj="$1" msg="$2"
  printf '%s | %s | %s\n' "$(date -u +%FT%TZ)" "$subj" "$msg" >> "$EVENT_LOG"
  [ -n "$WATCHDOG_SNS_TOPIC_ARN" ] && timeout 15 aws sns publish --topic-arn "$WATCHDOG_SNS_TOPIC_ARN" \
      --subject "$(printf '%.99s' "code-up watchdog: $subj")" --message "$msg" >/dev/null 2>&1 || true
  [ -n "$WATCHDOG_WEBHOOK_URL" ] && timeout 10 curl -s -X POST -H 'content-type: application/json' \
      -d "$(printf '{"text":"[code-up watchdog] %s: %s"}' "$subj" "$msg")" "$WATCHDOG_WEBHOOK_URL" >/dev/null 2>&1 || true
}

# ---- small helpers ----------------------------------------------------------
now() { date +%s; }
svc_active()  { systemctl is-active --quiet "$1"; }
svc_enabled() { systemctl is-enabled --quiet "$1" 2>/dev/null; }
port_open()   { ss -H -tln "sport = :$1" 2>/dev/null | grep -q .; }
http_code()   { timeout 15 curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 12 "$@" 2>/dev/null || echo 000; }
http_time()   { timeout 15 curl -s -o /dev/null -w '%{time_total}' --connect-timeout 5 --max-time 12 "$1" 2>/dev/null || echo 99; }
is2xx3xx()    { [[ "$1" =~ ^(200|201|204|206|301|302|303|304|307|308)$ ]]; }
ge()          { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0>=b+0)}'; }
lt()          { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0<b+0)}'; }
newer_than()  { [ "$1" -nt "$2" ]; }   # file1 newer than file2
json_ok()     { [ -s "$1" ] && jq -e . "$1" >/dev/null 2>&1; }

# cache a slow command's stdout for EXPENSIVE_TTL seconds
cached() {
  local key="$1"; shift
  local vf="$STATE_DIR/v_$key" tf="$STATE_DIR/v_${key}.ts" t
  t=$(cat "$tf" 2>/dev/null || echo 0)
  if [ -f "$vf" ] && [ $(( $(now) - t )) -lt "$EXPENSIVE_TTL" ]; then cat "$vf"; return 0; fi
  local out; out="$("$@" 2>/dev/null)"
  printf '%s' "$out" > "$vf"; now > "$tf"
  printf '%s' "$out"
}

# cooldown gate: succeeds (and stamps) only if <secs> have passed since last pass
cooldown_ok() {
  local key="$1" secs="$2" f="$STATE_DIR/cd_$1" last
  last=$(cat "$f" 2>/dev/null || echo 0)
  if [ $(( $(now) - last )) -ge "$secs" ]; then now > "$f"; return 0; fi
  return 1
}

DMESG_CACHE="$(cached dmesg sudo -n dmesg 2>/dev/null || true)"
dmesg_count() { printf '%s\n' "$DMESG_CACHE" | grep -Eic "$1" || true; }
dmesg_new() {   # true if the count of <pattern> lines grew since last run
  local key="$1" pat="$2" f="$STATE_DIR/dm_$1" cur prev first=0
  [ -f "$f" ] || first=1
  cur=$(dmesg_count "$pat"); prev=$(cat "$f" 2>/dev/null || echo 0)
  printf '%s' "$cur" > "$f"
  [ "$first" -eq 1 ] && return 1          # first run: just record a baseline
  [ "${cur:-0}" -gt "${prev:-0}" ]
}

# ---- PM2 snapshot ----------------------------------------------------------
JL="$(timeout 15 pm2 jlist 2>/dev/null || echo '[]')"
[ -z "$JL" ] && JL='[]'
jlq() { printf '%s' "$JL" | jq -r "$1" 2>/dev/null; }
WANT_INST="$(grep -oE 'instances:[[:space:]]*[0-9]+' ecosystem.config.js 2>/dev/null | grep -oE '[0-9]+' | head -1)"; WANT_INST="${WANT_INST:-2}"
PM2_TOTAL=$(jlq '[.[]|select(.name=="Thefake")]|length'); PM2_TOTAL=${PM2_TOTAL:-0}
PM2_ONLINE=$(jlq '[.[]|select(.name=="Thefake" and .pm2_env.status=="online")]|length'); PM2_ONLINE=${PM2_ONLINE:-0}
PM2_ERRORED=$(jlq '[.[]|select(.name=="Thefake" and .pm2_env.status=="errored")]|length'); PM2_ERRORED=${PM2_ERRORED:-0}
PM2_STOPPED=$(jlq '[.[]|select(.name=="Thefake" and (.pm2_env.status=="stopped" or .pm2_env.status=="stopping"))]|length'); PM2_STOPPED=${PM2_STOPPED:-0}
PM2_LAUNCH=$(jlq '[.[]|select(.name=="Thefake" and .pm2_env.status=="launching")]|length'); PM2_LAUNCH=${PM2_LAUNCH:-0}
PM2_RESTARTS=$(jlq '[.[]|select(.name=="Thefake")|.pm2_env.restart_time]|add // 0'); PM2_RESTARTS=${PM2_RESTARTS:-0}
PM2_UNSTABLE=$(jlq '[.[]|select(.name=="Thefake")|.pm2_env.unstable_restarts]|add // 0'); PM2_UNSTABLE=${PM2_UNSTABLE:-0}
PM2_MAXMEM=$(jlq '[.[]|select(.name=="Thefake")|.monit.memory]|max // 0'); PM2_MAXMEM=${PM2_MAXMEM:-0}
PM2_MAXCPU=$(jlq '[.[]|select(.name=="Thefake")|.monit.cpu]|max // 0'); PM2_MAXCPU=${PM2_MAXCPU:-0}
_nowms=$(( $(now) * 1000 ))
PM2_MINUP=$(jlq "[.[]|select(.name==\"Thefake\" and .pm2_env.status==\"online\")|($_nowms - .pm2_env.pm_uptime)]|min // 999999999")
PM2_MINUP=${PM2_MINUP:-999999999}
# restart delta since previous run
_prev_r=$(cat "$STATE_DIR/pm2_restarts" 2>/dev/null || echo "$PM2_RESTARTS")
printf '%s' "$PM2_RESTARTS" > "$STATE_DIR/pm2_restarts"
PM2_RDELTA=$(( PM2_RESTARTS - _prev_r )); [ "$PM2_RDELTA" -lt 0 ] && PM2_RDELTA=0

# ---- HTTP snapshot -------------------------------------------------------
H_CODE=$(http_code "$HEALTH_URL")
R_CODE=$(http_code "$HOME_URL")
H_BODY=$(timeout 15 curl -s --connect-timeout 5 --max-time 12 "$HEALTH_URL" 2>/dev/null || true)
H_TIME=$(http_time "$HEALTH_URL")
R_TIME=$(http_time "$HOME_URL")
PM2_LOG_TAIL=$(timeout 15 pm2 logs Thefake --lines 120 --nostream 2>/dev/null || true)

core_healthy() {
  local h r
  h=$(http_code "$HEALTH_URL"); r=$(http_code "$HOME_URL")
  { is2xx3xx "$h" || is2xx3xx "$r"; } || return 1
  local on; on=$(timeout 15 pm2 jlist 2>/dev/null | jq -r '[.[]|select(.name=="Thefake" and .pm2_env.status=="online")]|length' 2>/dev/null)
  [ "${on:-0}" -ge 1 ]
}

# ---- DB helpers --------------------------------------------------------
urldecode() { local s="${1//+/ }"; printf '%b' "${s//%/\\x}"; }
DBURL="$(env_val DATABASE_URL)"
DBOK=0; DBUSER=""; DBPASS=""; DBHOST=""; DBPORT="5432"; DBNAME="postgres"
if [[ "$DBURL" =~ ^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):([0-9]+)/([^?]+) ]]; then
  DBUSER="$(urldecode "${BASH_REMATCH[2]}")"; DBPASS="$(urldecode "${BASH_REMATCH[3]}")"
  DBHOST="${BASH_REMATCH[4]}"; DBPORT="${BASH_REMATCH[5]}"
  DBNAME="$(urldecode "${BASH_REMATCH[6]}")"; DBOK=1
fi
psqlq() {
  [ "$DBOK" = 1 ] || return 2
  PGPASSWORD="$DBPASS" timeout 12 psql -h "$DBHOST" -p "$DBPORT" -U "$DBUSER" -d "$DBNAME" \
    -v ON_ERROR_STOP=1 -tAqc "$1" 2>/dev/null
}
DB_TABLES=""; DB_CONN=""; DB_MAXCONN=""
if [ "$DBOK" = 1 ] && port_open "$DBPORT"; then
  DB_TABLES=$(psqlq "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
  DB_CONN=$(psqlq "SELECT count(*) FROM pg_stat_activity;")
  DB_MAXCONN=$(psqlq "SELECT setting::int FROM pg_settings WHERE name='max_connections';")
fi

# =============================================================================
#  THE 140 PROBES
#  meta <id>  -> sets D (description) and T (remedy tag; "warn" = log only)
#  probe <id> -> return 0 ok / 1 FAIL / 3 not-applicable
# =============================================================================
D=""; T=""
meta() {
case "$1" in
  # ---- PM2 (1-18) ----
  1)  D="pm2 binary present on PATH";                         T="warn";;
  2)  D="pm2 daemon answers ping";                            T="pm2";;
  3)  D="app 'Thefake' registered in pm2";                    T="pm2";;
  4)  D="at least one Thefake instance online";               T="pm2";;
  5)  D="all configured Thefake instances online";            T="pm2";;
  6)  D="no Thefake instance in errored state";               T="pm2";;
  7)  D="no Thefake instance stopped/stopping";               T="pm2";;
  8)  D="no Thefake instance stuck launching";                T="pm2";;
  9)  D="cumulative pm2 restart_time not runaway (<400)";     T="warn";;
  10) D="pm2 restart delta since last run < 8 (no crashloop)"; T="build";;
  11) D="not crashlooping (young uptime AND restart churn)";   T="pm2";;
  12) D="pm2 instance count equals configured";               T="pm2";;
  13) D="max instance RSS below restart ceiling (<930MB)";    T="pm2reload";;
  14) D="max instance CPU not pinned (<97%)";                 T="warn";;
  15) D="pm2 dump file present (~/.pm2/dump.pm2)";            T="pm2_save";;
  16) D="pm2 systemd boot unit enabled";                      T="pm2_startup";;
  17) D="something is listening on :3000";                    T="pm2";;
  18) D="no defunct/zombie node processes";                   T="pm2";;
  # ---- HTTP / app (19-36) ----
  19) D="TCP connect to 127.0.0.1:3000";                      T="pm2";;
  20) D="/api/health returns HTTP 200";                       T="pm2";;
  21) D="/ returns 2xx/3xx";                                  T="pm2";;
  22) D="/api/health body looks like the health JSON";        T="warn";;
  23) D="/api/health latency < 3s";                           T="pm2reload";;
  24) D="/ latency < 6s";                                     T="warn";;
  25) D="/api/health is not a 5xx";                           T="build";;
  26) D="app reachable through nginx on :80 (Host header)";   T="nginx";;
  27) D="https on 127.0.0.1:443 responds";                    T="nginx";;
  28) D="5 concurrent /api/health requests all succeed";      T="pm2reload";;
  29) D="no ECONNREFUSED in recent pm2 logs";                 T="build";;
  30) D="no EADDRINUSE in recent pm2 logs";                   T="killport";;
  31) D="no unhandledRejection/FATAL flood in pm2 logs";      T="warn";;
  32) D="response body is not a Next.js fatal error page";    T="build";;
  33) D="response carries html or a server/next header";      T="warn";;
  34) D="/api/health body is parseable JSON";                 T="warn";;
  35) D="/api/health sends a Content-Type header";            T="warn";;
  36) D="public https://$PUBLIC_HOST answers (200/301/403)";  T="warn";;
  # ---- Build / Next.js (37-54) ----
  37) D=".next directory exists";                             T="build";;
  38) D=".next/BUILD_ID present and non-empty";               T="build";;
  39) D=".next/build-manifest.json exists";                   T="build";;
  40) D=".next/prerender-manifest.json exists";               T="build";;
  41) D=".next/routes-manifest.json exists";                  T="build";;
  42) D=".next/required-server-files.json exists";            T="build";;
  43) D=".next/server directory populated";                   T="build";;
  44) D=".next/server/app or /pages compiled output present"; T="build";;
  45) D=".next/lock absent or stale (>10m)";                  T="lock";;
  46) D="node_modules/.bin/next resolvable";                  T="build";;
  47) D="installed next major version is 16";                 T="warn";;
  48) D="build not older than latest git commit";             T="warn";;
  49) D="no partial .next.tmp / .next-* dirs";                T="lock";;
  50) D="free disk > 2GB for a rebuild";                      T="disk";;
  51) D="MemAvailable > 400MB (or build can stop pm2)";       T="warn";;
  52) D=".next/cache directory exists";                       T="warn";;
  53) D=".next/prerender-manifest.json is valid JSON";        T="build";;
  54) D=".next/routes-manifest.json is valid JSON";           T="build";;
  # ---- Prisma / PostgreSQL (55-80) ----
  55) D="DATABASE_URL is set and parseable";                  T="warn";;
  56) D="DATABASE_URL points at localhost";                   T="warn";;
  57) D="DATABASE_URL has no pgbouncer=true";                 T="warn";;
  58) D="prisma CLI resolvable in node_modules";              T="prisma";;
  59) D="generated client node_modules/.prisma/client exists"; T="prisma";;
  60) D="node_modules/@prisma/client installed";              T="prisma";;
  61) D="generated Prisma client loads (node require)";        T="prisma";;
  62) D="postgresql systemd service active";                  T="pg";;
  63) D="TCP connect to postgres port";                       T="pg";;
  64) D="pg_isready reports ready";                            T="pg";;
  65) D="SELECT 1 succeeds with app credentials";             T="pg";;
  66) D="public schema has >= 70 tables";                     T="warn";;
  67) D="core table \"User\" exists";                         T="warn";;
  68) D="DB connections < 80% of max_connections";            T="pm2reload";;
  69) D="no 'too many clients' in pg/pm2 logs";               T="pm2reload";;
  70) D="postgres not in recovery mode";                      T="warn";;
  71) D="no unfinished row in _prisma_migrations";            T="warn";;
  72) D="no query running longer than 5 minutes";             T="warn";;
  73) D="postgres uptime > 60s (not restart-looping)";        T="warn";;
  74) D="data volume usage < 92%";                            T="disk";;
  75) D="DIRECT_URL is set";                                  T="warn";;
  76) D="newest DB backup dump < 30h old";                    T="warn";;
  77) D="backup.log last line is not a FAILURE";              T="warn";;
  78) D="S3 backup bucket reachable";                         T="warn";;
  79) D="no FATAL in recent postgresql journal";              T="warn";;
  80) D="pg_hba uses scram (not ident) for 127.0.0.1";        T="warn";;
  # ---- Disk / filesystem (81-98) ----
  81) D="root filesystem usage < 90%";                        T="disk";;
  82) D="/tmp usage < 90%";                                   T="disk";;
  83) D="root filesystem inode usage < 90%";                  T="disk";;
  84) D="Thefake/logs directory < 1GB";                       T="disk";;
  85) D="~/.pm2/logs directory < 1GB";                        T="disk";;
  86) D="systemd journal on-disk < 1GB";                      T="disk";;
  87) D="/var/log < 2GB";                                     T="disk";;
  88) D="node_modules present and > 100MB";                   T="build";;
  89) D="uploads/ exists and is writable";                    T="mkdirs";;
  90) D=".env file exists";                                   T="warn";;
  91) D=".env permissions are 600";                           T="env_perms";;
  92) D="package-lock.json present";                          T="warn";;
  93) D="ecosystem.config.js present";                        T="warn";;
  94) D="server.js present";                                  T="warn";;
  95) D="no core.* dump files in home dir";                   T="disk";;
  96) D="no watchdog lock file older than 1h in /tmp";        T="lock";;
  97) D="tsconfig.tsbuildinfo present";                       T="warn";;
  98) D=".git directory present";                             T="warn";;
  # ---- Memory / CPU / kernel (99-114) ----
  99)  D="MemAvailable > 8% of RAM";                          T="caches";;
  100) D="swap usage < 60%";                                  T="caches";;
  101) D="no new OOM-killer event since last run";            T="pm2reload";;
  102) D="load average (1m) < 8";                             T="warn";;
  103) D="load average (5m) < 6";                             T="warn";;
  104) D="CPU steal < 30%";                                   T="warn";;
  105) D="no new kernel hung-task warning";                   T="warn";;
  106) D="total node RSS < 2.5GB";                            T="pm2reload";;
  107) D="zombie process count < 20";                         T="pm2";;
  108) D="total process count < 500";                         T="warn";;
  109) D="open file descriptors < 80% of fs.file-max";        T="caches";;
  110) D="/dev/shm usage < 90%";                              T="disk";;
  111) D="no new node segfault in kernel log";               T="build";;
  112) D="CPU core count >= 2";                               T="warn";;
  113) D="system uptime > 120s (not mid-boot flap)";          T="warn";;
  114) D="watchdog did not just reboot the box (<15m ago)";   T="warn";;
  # ---- Network / services (115-130) ----
  115) D="DNS resolution works";                              T="warn";;
  116) D="outbound HTTPS works";                              T="warn";;
  117) D="nginx service active";                              T="nginx";;
  118) D="nginx config passes 'nginx -t'";                    T="nginx";;
  119) D="port 80 listening";                                 T="nginx";;
  120) D="port 443 listening";                                T="nginx";;
  121) D="a TLS certificate file exists";                     T="warn";;
  122) D="TLS certificate parses with openssl";               T="warn";;
  123) D="sshd listening on :22";                             T="warn";;
  124) D="a default route is present";                        T="warn";;
  125) D="mcp-server service active";                         T="mcp";;
  126) D="MCP port 8000 listening";                           T="mcp";;
  127) D="MCP endpoint answers on 127.0.0.1:8000";            T="mcp";;
  128) D="nginx is not returning 502 for the app";            T="pm2";;
  129) D="established sockets < 20000";                        T="warn";;
  130) D="cron daemon (crond) active";                        T="crond";;
  # ---- Cron / time / deploy / git (131-140) ----
  131) D="crontab has the */2 watchdog entry";                T="cron_entries";;
  132) D="crontab has the nightly backup entry";              T="cron_entries";;
  133) D="crontab has the @reboot watchdog entry";            T="cron_entries";;
  134) D="time synchronisation service active";               T="warn";;
  135) D="systemd state is not 'degraded'";                   T="warn";;
  136) D="git rev-parse HEAD works";                          T="warn";;
  137) D="git HEAD is on a branch (not detached)";            T="warn";;
  138) D="update.sh present and executable";                  T="warn";;
  139) D="watchdog script contains no OS-reboot/shutdown command"; T="warn";;
  140) D="prisma schema provider is postgresql (not sqlite)"; T="warn";;
  *)  D="unknown"; T="warn";;
esac
}

probe() {
case "$1" in
  1)  command -v pm2 >/dev/null ;;
  2)  timeout 12 pm2 ping >/dev/null 2>&1 ;;
  3)  [ "$PM2_TOTAL" -ge 1 ] ;;
  4)  [ "$PM2_ONLINE" -ge 1 ] ;;
  5)  [ "$PM2_ONLINE" -ge "$WANT_INST" ] ;;
  6)  [ "$PM2_ERRORED" -eq 0 ] ;;
  7)  [ "$PM2_STOPPED" -eq 0 ] ;;
  8)  [ "$PM2_LAUNCH" -eq 0 ] ;;
  9)  [ "$PM2_RESTARTS" -lt 400 ] ;;
  10) [ "$PM2_RDELTA" -lt 8 ] ;;
  11) [ "$PM2_MINUP" -gt 60000 ] || [ "$PM2_RDELTA" -lt 3 ] ;;   # young uptime alone (fresh deploy/reboot) is fine
  12) [ "$PM2_TOTAL" -eq "$WANT_INST" ] ;;
  13) [ "$PM2_MAXMEM" -lt 975175680 ] ;;
  14) lt "$PM2_MAXCPU" 97 ;;
  15) [ -s "$HOME/.pm2/dump.pm2" ] ;;
  16) svc_enabled pm2-ec2-user ;;
  17) port_open 3000 ;;
  18) [ "$(ps -eo stat,comm 2>/dev/null | awk '$1 ~ /Z/ && $2 ~ /node|next/' | wc -l)" -eq 0 ] ;;

  19) timeout 6 bash -c 'exec 3<>/dev/tcp/127.0.0.1/3000' 2>/dev/null ;;
  20) [ "$H_CODE" = 200 ] ;;
  21) is2xx3xx "$R_CODE" ;;
  22) printf '%s' "$H_BODY" | grep -qE '"(ok|status)"' ;;
  23) lt "$H_TIME" 3 ;;
  24) lt "$R_TIME" 6 ;;
  25) [[ ! "$H_CODE" =~ ^5 ]] ;;
  26) is2xx3xx "$(http_code -H "Host: $PUBLIC_HOST" http://127.0.0.1/api/health)" ;;
  27) c=$(http_code -k https://127.0.0.1/); [ "$c" != 000 ] ;;
  28) ok=1; for _ in 1 2 3 4 5; do [ "$(http_code "$HEALTH_URL")" = 200 ] || ok=0; done; [ "$ok" = 1 ] ;;
  29) ! printf '%s' "$PM2_LOG_TAIL" | grep -q 'ECONNREFUSED' ;;
  30) ! printf '%s' "$PM2_LOG_TAIL" | grep -q 'EADDRINUSE' ;;
  31) [ "$(printf '%s' "$PM2_LOG_TAIL" | grep -Ec 'unhandledRejection|FATAL|Cannot find module')" -lt 6 ] ;;
  32) ! printf '%s' "$H_BODY" | grep -qiE 'Application error: a server-side exception|Internal Server Error' ;;
  33) printf '%s' "$H_BODY" | grep -qiE '<html|"ok"|"status"' ;;
  34) [ -z "$H_BODY" ] || printf '%s' "$H_BODY" | jq -e . >/dev/null 2>&1 ;;
  35) timeout 12 curl -s -I --max-time 10 "$HEALTH_URL" 2>/dev/null | grep -qi '^content-type:' ;;
  36) c=$(http_code -I "https://$PUBLIC_HOST/"); [[ "$c" =~ ^(200|301|302|403|307|308)$ ]] ;;

  37) [ -d .next ] ;;
  38) [ -s .next/BUILD_ID ] ;;
  39) [ -f .next/build-manifest.json ] ;;
  40) [ -f .next/prerender-manifest.json ] ;;
  41) [ -f .next/routes-manifest.json ] ;;
  42) [ -f .next/required-server-files.json ] ;;
  43) [ -d .next/server ] && [ -n "$(ls -A .next/server 2>/dev/null)" ] ;;
  44) [ -d .next/server/app ] || [ -d .next/server/pages ] ;;
  45) if [ ! -e .next/lock ]; then true; else [ -n "$(find .next/lock -mmin -10 2>/dev/null)" ]; fi ;;
  46) [ -x node_modules/.bin/next ] ;;
  47) v=$(jq -r '.version' node_modules/next/package.json 2>/dev/null); [[ "$v" == 16.* ]] ;;
  48) { ! git rev-parse HEAD >/dev/null 2>&1; } || [ ! -f .next/BUILD_ID ] || [ ! .git/HEAD -nt .next/BUILD_ID ] ;;
  49) [ -z "$(ls -d .next.tmp .next-* 2>/dev/null)" ] ;;
  50) a=$(df -Pk / | awk 'NR==2{print $4}'); [ "${a:-0}" -gt 2097152 ] ;;
  51) m=$(awk '/MemAvailable/{print $2}' /proc/meminfo); [ "${m:-0}" -gt 409600 ] ;;
  52) [ -d .next/cache ] ;;
  53) json_ok .next/prerender-manifest.json ;;
  54) json_ok .next/routes-manifest.json ;;

  55) [ "$DBOK" = 1 ] ;;
  56) [[ "$DBHOST" =~ ^(127\.0\.0\.1|localhost|::1)$ ]] ;;
  57) [[ ! "$DBURL" =~ pgbouncer=true ]] ;;
  58) [ -x node_modules/.bin/prisma ] ;;
  59) [ -f src/generated/prisma/index.js ] || [ -f node_modules/.prisma/client/index.js ] ;;
  60) [ -d node_modules/@prisma/client ] || [ -d src/generated/prisma ] ;;
  61) timeout 25 node -e 'require("./src/generated/prisma")' >/dev/null 2>&1 || timeout 25 node -e 'require("@prisma/client")' >/dev/null 2>&1 ;;
  62) svc_active postgresql || svc_active postgresql-16 ;;
  63) port_open "$DBPORT" ;;
  64) timeout 10 pg_isready -h "$DBHOST" -p "$DBPORT" -q ;;
  65) [ "$(psqlq 'SELECT 1;')" = 1 ] ;;
  66) [ "${DB_TABLES:-0}" -ge 70 ] ;;
  67) [ "$(psqlq "SELECT to_regclass('public.\"User\"') IS NOT NULL;")" = t ] ;;
  68) [ -z "$DB_CONN" ] || [ -z "$DB_MAXCONN" ] || awk -v c="$DB_CONN" -v m="$DB_MAXCONN" 'BEGIN{exit !(c < 0.8*m)}' ;;
  69) ! printf '%s' "$PM2_LOG_TAIL" | grep -qiE 'too many clients|remaining connection slots' ;;
  70) [ "$(psqlq 'SELECT pg_is_in_recovery();')" = f ] ;;
  71) n=$(psqlq "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;"); [ -z "$n" ] || [ "$n" = 0 ] ;;
  72) n=$(psqlq "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND now()-query_start > interval '5 minutes' AND query NOT ILIKE '%pg_stat_activity%';"); [ -z "$n" ] || [ "$n" = 0 ] ;;
  73) s=$(psqlq "SELECT (now() - pg_postmaster_start_time() > interval '60 seconds');"); [ -z "$s" ] || [ "$s" = t ] ;;
  74) p=$(df -Pk / | awk 'NR==2{gsub("%","",$5);print $5}'); [ "${p:-0}" -lt 92 ] ;;
  75) [ -n "$(env_val DIRECT_URL)" ] ;;
  76) [ -n "$(find /home/ec2-user/backups -name 'codeup-*.dump' -mmin -1800 2>/dev/null | head -1)" ] ;;
  77) l=$(tail -1 /home/ec2-user/backups/backup.log 2>/dev/null); [[ ! "$l" =~ (FAIL|BAD) ]] ;;
  78) timeout 20 aws s3 ls "s3://codeup-backups-687374520011/nightly/" --page-size 1 >/dev/null 2>&1 ;;
  79) [ "$(cached pgjournal sudo -n journalctl -u postgresql --no-pager -n 60 -q 2>/dev/null | grep -Ec 'FATAL|PANIC')" -lt 1 ] ;;
  80) f=/var/lib/pgsql/data/pg_hba.conf; [ -r "$f" ] || f=$(sudo -n psql -U postgres -tAc 'SHOW hba_file;' 2>/dev/null);
      if sudo -n test -r "$f" 2>/dev/null; then sudo -n grep -E '^host[[:space:]]+all[[:space:]]+all[[:space:]]+127\.0\.0\.1' "$f" 2>/dev/null | grep -q 'scram'; else true; fi ;;

  81) p=$(df -Pk / | awk 'NR==2{gsub("%","",$5);print $5}'); [ "${p:-100}" -lt 90 ] ;;
  82) p=$(df -Pk /tmp | awk 'NR==2{gsub("%","",$5);print $5}'); [ "${p:-100}" -lt 90 ] ;;
  83) p=$(df -Pi / | awk 'NR==2{gsub("%","",$5);print $5}'); [ "${p:-100}" -lt 90 ] ;;
  84) k=$(cached du_logs du -sk "$APP_DIR/logs" | awk '{print $1}'); [ "${k:-0}" -lt 1048576 ] ;;
  85) k=$(cached du_pm2logs du -sk "$HOME/.pm2/logs" | awk '{print $1}'); [ "${k:-0}" -lt 1048576 ] ;;
  86) k=$(cached du_journal sudo -n du -sk /var/log/journal | awk '{print $1}'); [ "${k:-0}" -lt 1048576 ] ;;
  87) k=$(cached du_varlog sudo -n du -sk /var/log | awk '{print $1}'); [ "${k:-0}" -lt 2097152 ] ;;
  88) k=$(cached du_nm du -sk "$APP_DIR/node_modules" | awk '{print $1}'); [ "${k:-0}" -gt 102400 ] ;;
  89) [ -d uploads ] && [ -w uploads ] ;;
  90) [ -f .env ] ;;
  91) [ "$(stat -c '%a' .env 2>/dev/null)" = 600 ] ;;
  92) [ -f package-lock.json ] ;;
  93) [ -f ecosystem.config.js ] ;;
  94) [ -f server.js ] ;;
  95) [ -z "$(ls /home/ec2-user/core.* 2>/dev/null)" ] ;;
  96) [ -z "$(find /tmp -maxdepth 2 -iname '*thefake*' \( -name '*.lock' -o -name 'lock' \) -mmin +60 2>/dev/null)" ] ;;
  97) [ -f tsconfig.tsbuildinfo ] ;;
  98) [ -d .git ] ;;

  99)  a=$(awk '/MemAvailable/{print $2}' /proc/meminfo); t=$(awk '/MemTotal/{print $2}' /proc/meminfo); awk -v a="$a" -v t="$t" 'BEGIN{exit !(t>0 && a > 0.08*t)}' ;;
  100) st=$(awk '/SwapTotal/{print $2}' /proc/meminfo); sf=$(awk '/SwapFree/{print $2}' /proc/meminfo); [ "${st:-0}" -eq 0 ] || awk -v u="$((st-sf))" -v t="$st" 'BEGIN{exit !(u < 0.6*t)}' ;;
  101) ! dmesg_new oom 'Out of memory|oom-kill|Killed process' ;;
  102) l=$(awk '{print $1}' /proc/loadavg); lt "$l" 8 ;;
  103) l=$(awk '{print $2}' /proc/loadavg); lt "$l" 6 ;;
  104) s=$(timeout 8 vmstat 1 2 2>/dev/null | tail -1 | awk '{print $NF}'); [ -z "$s" ] || [ "$s" -lt 30 ] ;;
  105) ! dmesg_new hung 'hung_task|blocked for more than [0-9]+ seconds' ;;
  106) r=$(ps -C node -o rss= 2>/dev/null | awk '{s+=$1}END{print s+0}'); [ "${r:-0}" -lt 2621440 ] ;;
  107) [ "$(ps -eo stat= 2>/dev/null | grep -c '^Z')" -lt 20 ] ;;
  108) [ "$(ps -e --no-headers 2>/dev/null | wc -l)" -lt 500 ] ;;
  109) read -r alloc _ max < /proc/sys/fs/file-nr; awk -v a="$alloc" -v m="$max" 'BEGIN{exit !(m>0 && a < 0.8*m)}' ;;
  110) p=$(df -P /dev/shm 2>/dev/null | awk 'NR==2{gsub("%","",$5);print $5}'); [ "${p:-0}" -lt 90 ] ;;
  111) ! dmesg_new segv 'segfault|general protection|traps: node' ;;
  112) [ "$(nproc 2>/dev/null || echo 1)" -ge 2 ] ;;
  113) [ "$(cut -d. -f1 /proc/uptime)" -gt 120 ] ;;
  114) [ -z "$(find "$STATE_DIR/last_reboot" -mmin -15 2>/dev/null)" ] ;;

  115) getent hosts "$PUBLIC_HOST" >/dev/null 2>&1 || getent hosts cloudflare.com >/dev/null 2>&1 ;;
  116) c=$(http_code -I https://1.1.1.1/); [ "$c" != 000 ] ;;
  117) svc_active nginx ;;
  118) sudo -n nginx -t >/dev/null 2>&1 ;;
  119) port_open 80 ;;
  120) port_open 443 ;;
  121) [ -n "$(sudo -n bash -c 'ls /etc/letsencrypt/live/*/fullchain.pem /etc/pki/tls/certs/*.pem /etc/ssl/certs/nginx*.pem 2>/dev/null' | head -1)" ] ;;
  122) f=$(sudo -n bash -c 'ls /etc/letsencrypt/live/*/fullchain.pem 2>/dev/null' | head -1); [ -z "$f" ] || sudo -n openssl x509 -in "$f" -noout >/dev/null 2>&1 ;;
  123) port_open 22 ;;
  124) ip route 2>/dev/null | grep -q '^default ' ;;
  125) svc_active mcp-server ;;
  126) port_open 8000 ;;
  127) c=$(http_code http://127.0.0.1:8000/); [ "$c" != 000 ] ;;
  128) c=$(http_code -H "Host: $PUBLIC_HOST" http://127.0.0.1/); [ "$c" != 502 ] ;;
  129) [ "$(ss -H -t state established 2>/dev/null | wc -l)" -lt 20000 ] ;;
  130) svc_active crond ;;

  131) crontab -l 2>/dev/null | grep -q 'server-watchdog.sh' && crontab -l 2>/dev/null | grep -E 'server-watchdog\.sh' | grep -qE '\*/[0-9]+ ' ;;
  132) crontab -l 2>/dev/null | grep -q 'backup-db.sh' ;;
  133) crontab -l 2>/dev/null | grep -qE '@reboot .*server-watchdog\.sh' ;;
  134) svc_active chronyd || svc_active systemd-timesyncd || svc_active ntpd ;;
  135) [ "$(systemctl is-system-running 2>/dev/null)" != degraded ] ;;
  136) git rev-parse HEAD >/dev/null 2>&1 ;;
  137) [ "$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" != "" ] ;;
  138) [ -x update.sh ] || [ -x /home/ec2-user/update.sh ] ;;
  139) ! grep -qE '^[[:space:]]*(sudo( -n)? +)?((/[a-z/]*bin/)?(reboot|shutdown|poweroff|halt)|systemctl( +--?[a-z-]+)* +(reboot|poweroff|halt))([[:space:]]|$|;|&)' "$APP_DIR/scripts/server-watchdog.sh" ;;
  140) grep -qE 'provider[[:space:]]*=[[:space:]]*"postgresql"' prisma/schema.prisma ;;
  *)  return 3 ;;
esac
}

# =============================================================================
#  REMEDIATION
# =============================================================================
REMEDY_LOG=""
did() { REMEDY_LOG="$REMEDY_LOG $1"; log INFO "remedy: $1"; }

remedy_lock() {
  did lock
  rm -f .next/lock 2>/dev/null || true
  rm -rf .next.tmp .next-* 2>/dev/null || true
  find /tmp -maxdepth 2 -iname '*thefake*' \( -name '*.lock' -o -name 'lock' \) -mmin +60 -delete 2>/dev/null || true
  pkill -f 'next-server' 2>/dev/null || true
}
remedy_env_perms() { did env_perms; chmod 600 .env 2>/dev/null || true; }
remedy_mkdirs()    { did mkdirs; mkdir -p uploads logs "$STATE_DIR" 2>/dev/null || true; chmod u+rwx uploads 2>/dev/null || true; }
remedy_pm2_save()  { did pm2_save; timeout 20 pm2 save >/dev/null 2>&1 || true; }
remedy_pm2_startup() {
  did pm2_startup
  timeout 25 pm2 startup systemd -u ec2-user --hp /home/ec2-user >/dev/null 2>&1 || true
  sudo -n systemctl enable pm2-ec2-user >/dev/null 2>&1 || true
  timeout 20 pm2 save >/dev/null 2>&1 || true
}
remedy_killport() {
  did killport
  fuser -k 3000/tcp >/dev/null 2>&1 || true
  sleep 2
}
remedy_crond()  { did crond;  cooldown_ok crond 300  && sudo -n systemctl restart crond >/dev/null 2>&1 || true; }
remedy_mcp()    { did mcp;    cooldown_ok mcp 300    && sudo -n systemctl restart mcp-server >/dev/null 2>&1 || true; }
remedy_nginx()  {
  did nginx
  if cooldown_ok nginx 300; then
    if sudo -n nginx -t >/dev/null 2>&1; then sudo -n systemctl reload nginx >/dev/null 2>&1 || sudo -n systemctl restart nginx >/dev/null 2>&1 || true
    else sudo -n systemctl restart nginx >/dev/null 2>&1 || true; fi
  fi
}
remedy_pg() {
  did pg
  cooldown_ok pg 300 || return 0
  sudo -n systemctl restart postgresql >/dev/null 2>&1 || sudo -n systemctl restart postgresql-16 >/dev/null 2>&1 || true
  for _ in $(seq 1 15); do timeout 5 pg_isready -h "$DBHOST" -p "$DBPORT" -q && break; sleep 2; done
}
remedy_cron_entries() {
  did cron_entries
  local t; t="$(mktemp)"
  crontab -l 2>/dev/null | grep -v 'server-watchdog.sh' | grep -v 'backup-db.sh' > "$t" || true
  # flock -n on a dedicated cron lock: if a previous tick is still inside a long
  # rebuild, the next tick exits immediately instead of stacking. (The script
  # also holds its own flock on /tmp/thefake_watchdog.lock -- different file, so
  # the two never deadlock.) @reboot waits 45s so pm2/postgres/nginx are up.
  cat >> "$t" <<'CRON'
30 2 * * * /home/ec2-user/backup-db.sh
*/2 * * * * /usr/bin/flock -n /tmp/thefake_watchdog.cron.lock /home/ec2-user/Thefake/scripts/server-watchdog.sh >> /home/ec2-user/Thefake/logs/watchdog.log 2>&1
@reboot /bin/sleep 45 && /usr/bin/flock -n /tmp/thefake_watchdog.cron.lock /home/ec2-user/Thefake/scripts/server-watchdog.sh >> /home/ec2-user/Thefake/logs/watchdog.log 2>&1
CRON
  crontab "$t" && rm -f "$t"
}
remedy_caches() {
  did caches
  cooldown_ok caches 600 || return 0
  timeout 20 pm2 flush >/dev/null 2>&1 || true
  sync
  sudo -n bash -c 'echo 1 > /proc/sys/vm/drop_caches' 2>/dev/null || true
  sudo -n journalctl --vacuum-size=200M >/dev/null 2>&1 || true
}
remedy_disk() {
  did disk
  cooldown_ok disk 600 || return 0
  timeout 20 pm2 flush >/dev/null 2>&1 || true
  for f in "$APP_DIR"/logs/*.log "$HOME"/.pm2/logs/*.log; do
    [ -f "$f" ] || continue
    [ "$(wc -l < "$f" 2>/dev/null || echo 0)" -gt 5000 ] && { tail -n 2000 "$f" > "$f.tmp" 2>/dev/null && mv "$f.tmp" "$f"; }
  done
  sudo -n journalctl --vacuum-size=200M >/dev/null 2>&1 || true
  timeout 60 npm cache clean --force >/dev/null 2>&1 || true
  rm -rf .next/cache/webpack 2>/dev/null || true
  rm -f /home/ec2-user/core.* 2>/dev/null || true
  find /home/ec2-user/backups -name 'codeup-*.dump' -mtime +30 -delete 2>/dev/null || true
  find "$APP_DIR" -maxdepth 1 -name '*.log' -size +100M -exec truncate -s 20M {} \; 2>/dev/null || true
}
remedy_prisma() {
  did prisma
  cooldown_ok prisma 300 || return 0
  timeout 180 node scripts/prisma-generate.js >> "$LOG_FILE" 2>&1 \
    || timeout 180 npx --yes prisma generate >> "$LOG_FILE" 2>&1 || true
  timeout 60 pm2 restart ecosystem.config.js --update-env >> "$LOG_FILE" 2>&1 || true
}
remedy_pm2reload() {
  did pm2reload
  cooldown_ok pm2reload 120 || return 0
  timeout 60 pm2 reload ecosystem.config.js --update-env >> "$LOG_FILE" 2>&1 \
    || timeout 60 pm2 reload Thefake --update-env >> "$LOG_FILE" 2>&1 || true
}
remedy_pm2() {
  did pm2
  cooldown_ok pm2 90 || return 0
  timeout 12 pm2 ping >/dev/null 2>&1 || timeout 30 pm2 resurrect >> "$LOG_FILE" 2>&1 || true
  # only free port 3000 if nothing pm2-managed is currently serving it (rogue process)
  if ! timeout 15 pm2 jlist 2>/dev/null | jq -e '.[]|select(.name=="Thefake" and .pm2_env.status=="online")' >/dev/null 2>&1; then
    fuser -k 3000/tcp >/dev/null 2>&1 || true
    sleep 1
  fi
  timeout 60 pm2 startOrReload ecosystem.config.js --update-env >> "$LOG_FILE" 2>&1 \
    || timeout 60 pm2 start ecosystem.config.js --update-env >> "$LOG_FILE" 2>&1 \
    || timeout 60 pm2 restart Thefake --update-env >> "$LOG_FILE" 2>&1 || true
  timeout 20 pm2 save >/dev/null 2>&1 || true
}
remedy_build() {
  did build
  cooldown_ok build 1200 || { log WARN "build remedy suppressed by 20m cooldown"; return 0; }
  log WARN "deep heal: stop cluster, prisma generate, next build"

  # Stop the cluster BEFORE building. A half-missing .next makes every worker
  # exit(1) on boot; leaving pm2 to keep respawning it starves the build of the
  # very RAM/CPU it needs (this box has 2 vCPU / ~3.7GB + 2GB swap). Stop, kill
  # any stray next-server, free port 3000, then build on a quiet machine.
  timeout 60 pm2 stop Thefake >> "$LOG_FILE" 2>&1 || true
  pkill -f 'next-server' 2>/dev/null || true
  fuser -k 3000/tcp >/dev/null 2>&1 || true
  rm -f .next/lock 2>/dev/null || true
  sleep 2

  if [ ! -x node_modules/.bin/next ] || [ ! -d node_modules/.prisma/client ]; then
    log WARN "node_modules incomplete -> npm ci"
    timeout 600 npm ci --no-audit --no-fund >> "$LOG_FILE" 2>&1 || timeout 600 npm install --no-audit --no-fund >> "$LOG_FILE" 2>&1 || true
  fi
  timeout 180 node scripts/prisma-generate.js >> "$LOG_FILE" 2>&1 || true

  # Success == build exited 0 AND the artifacts that were missing are now on disk.
  if timeout 900 env NODE_OPTIONS="--max-old-space-size=2048" npx next build --webpack >> "$LOG_FILE" 2>&1 \
       && [ -s .next/BUILD_ID ] && [ -f .next/routes-manifest.json ] && [ -f .next/required-server-files.json ] && [ -d .next/server ]; then
    rm -f "$STATE_DIR/build_failed"
    log INFO "build OK -> (re)creating cluster from ecosystem.config.js"
    # delete first: a worker parked in "errored" by max_restarts ignores `pm2 start`
    timeout 30 pm2 delete Thefake >> "$LOG_FILE" 2>&1 || true
    timeout 90 pm2 start ecosystem.config.js --update-env >> "$LOG_FILE" 2>&1 || true
    timeout 15 pm2 reset Thefake >/dev/null 2>&1 || true
    timeout 20 pm2 save >/dev/null 2>&1 || true
  else
    # DO NOT restart pm2 here. A failed build means the artifacts are still
    # missing/corrupt, so starting the cluster would only crash-loop it -- the
    # exact spiral that caused the 2026-09-02 incident. Leave it stopped, persist
    # that state, page a human, and let the box idle so someone can get in.
    : > "$STATE_DIR/build_failed"
    timeout 20 pm2 save >/dev/null 2>&1 || true
    log CRITICAL "build FAILED -- cluster left STOPPED (no crash-loop, no OS reboot); manual fix required"
    notify "CRITICAL" "code-up self-heal: 'next build' FAILED. PM2 'Thefake' left STOPPED so the box stays reachable over SSH/SSM. The .next build is missing/corrupt and needs a human. The OS was NOT rebooted."
  fi
}

run_remedy() {
  case "$1" in
    lock) remedy_lock;; env_perms) remedy_env_perms;; mkdirs) remedy_mkdirs;;
    pm2_save) remedy_pm2_save;; pm2_startup) remedy_pm2_startup;; killport) remedy_killport;;
    crond) remedy_crond;; mcp) remedy_mcp;; nginx) remedy_nginx;; pg) remedy_pg;;
    cron_entries) remedy_cron_entries;; caches) remedy_caches;; disk) remedy_disk;;
    prisma) remedy_prisma;; pm2reload) remedy_pm2reload;; pm2) remedy_pm2;; build) remedy_build;;
  esac
}

# =============================================================================
#  MAIN
# =============================================================================
now > "$STATE_DIR/last_run"
FAILED_IDS=(); WARN_IDS=(); SKIP_IDS=(); declare -A TAGS_HIT=()
PASS=0

for i in $(seq 1 140); do
  meta "$i"
  probe "$i"; rc=$?
  if [ "$rc" -eq 0 ]; then
    PASS=$((PASS+1))
  elif [ "$rc" -eq 3 ]; then
    SKIP_IDS+=("$i")
  else
    if [ "$T" = "warn" ]; then
      WARN_IDS+=("$i"); log WARN "check $i FAILED (advisory): $D"
    else
      FAILED_IDS+=("$i"); TAGS_HIT["$T"]=1
      log WARN "check $i FAILED: $D  -> remedy:$T"
    fi
  fi
done

log INFO "probes: $PASS ok / ${#FAILED_IDS[@]} actionable / ${#WARN_IDS[@]} advisory / ${#SKIP_IDS[@]} n/a"

# A full rebuild is expensive and takes the cluster down. Only do it when the app
# is genuinely broken -- i.e. a build artifact is actually missing/corrupt, or
# core HTTP is failing right now. Soft signals (a stray ECONNREFUSED in the logs,
# a slow response) must never, on their own, trigger a rebuild of a serving app.
BUILD_HARD_IDS=" 37 38 39 40 41 42 43 44 46 53 54 88 "
BUILD_HARD=0
if [ -n "${TAGS_HIT[build]:-}" ]; then
  hard=0
  for id in "${FAILED_IDS[@]}"; do [[ "$BUILD_HARD_IDS" == *" $id "* ]] && hard=1; done
  BUILD_HARD=$hard
  if [ "$hard" -eq 0 ] && core_healthy; then
    log WARN "build remedy SKIPPED: app is serving and every build artifact is present (soft triggers: ${FAILED_IDS[*]})"
    unset 'TAGS_HIT[build]'
  fi
fi

# When a build artifact is genuinely missing/corrupt, remedy_build owns the whole
# recovery: it stops the cluster, regenerates Prisma, rebuilds, and only then
# starts pm2. Running the lighter pm2 / pm2reload / prisma remedies first would
# just spin up a cluster that crash-loops on the missing .next for the handful of
# seconds until remedy_build stops it again -- wasted churn. Skip them this cycle.
if [ "$BUILD_HARD" -eq 1 ] && [ -n "${TAGS_HIT[build]:-}" ]; then
  for t in pm2 pm2reload prisma; do
    [ -n "${TAGS_HIT[$t]:-}" ] && log WARN "remedy $t deferred -- remedy_build will handle the rebuild+restart"
    unset "TAGS_HIT[$t]"
  done
fi

REMEDIED=0
if [ "${#TAGS_HIT[@]}" -gt 0 ]; then
  REMEDIED=1
  notify "repairing" "failing checks: ${FAILED_IDS[*]} ; remedies: ${!TAGS_HIT[*]}"
  # cheapest first, most drastic last
  for tag in env_perms mkdirs lock pm2_save pm2_startup cron_entries crond killport mcp nginx caches disk pg pm2reload prisma pm2 build; do
    [ -n "${TAGS_HIT[$tag]:-}" ] && run_remedy "$tag"
  done
  sleep 6
fi

# ---- verdict + escalation --------------------------------------------------
# This watchdog NEVER reboots the OS. The 2026-09-02 incident proved a reboot
# cannot fix a missing/corrupt .next build and turns a single outage into an
# infinite reboot loop (PM2 crash-loops on boot -> CPU 100% -> watchdog reboots
# -> repeat). The most drastic action here is ONE PM2 kick, and only when a
# valid production build is actually present on disk.
HEALTHY=1; core_healthy || HEALTHY=0
FAILC_FILE="$STATE_DIR/consec_fail"

if [ "$HEALTHY" -eq 1 ]; then
  if [ "$REMEDIED" -eq 1 ]; then
    log INFO "recovered: core health restored after [${REMEDY_LOG# }]"
    notify "recovered" "core health OK after remedies:${REMEDY_LOG}"
  fi
  rm -f "$FAILC_FILE" "$STATE_DIR/build_failed"
else
  prev=$(cat "$FAILC_FILE" 2>/dev/null || echo 0); cur=$((prev+1)); echo "$cur" > "$FAILC_FILE"
  log ERROR "core health STILL DOWN after remedies (consecutive failure $cur/3)"
  notify "still-down" "core health down after remedies:${REMEDY_LOG:-none} (streak $cur/3)"
  if [ "$cur" -ge 3 ] && cooldown_ok alert 1800; then
    build_present=0
    if [ ! -f "$STATE_DIR/build_failed" ] && [ -s .next/BUILD_ID ] && [ -f .next/routes-manifest.json ] \
         && [ -f .next/required-server-files.json ] && [ -d .next/server ]; then
      build_present=1
    fi
    if [ "$build_present" -eq 1 ]; then
      log CRITICAL "core health down 3x with a valid .next build on disk -- one PM2 restart, then notifying (OS reboot disabled)"
      notify "CRITICAL" "code-up core health down after 3 recovery cycles. A valid .next build IS present -- restarting PM2 'Thefake' once. The OS was NOT rebooted."
      timeout 60 pm2 restart Thefake --update-env >> "$LOG_FILE" 2>&1 \
        || timeout 60 pm2 start ecosystem.config.js --update-env >> "$LOG_FILE" 2>&1 || true
      timeout 20 pm2 save >/dev/null 2>&1 || true
    else
      log CRITICAL "core health down 3x AND the .next build is missing/broken -- PM2 left stopped, OS NOT rebooted, human required"
      notify "CRITICAL" "code-up DOWN: the .next build is missing/broken and self-heal could not rebuild it. PM2 left stopped so the box stays reachable over SSH/SSM. No OS reboot. Manual intervention required."
    fi
  fi
fi

# ---- status snapshot -----------------------------------------------------
jq -n \
  --arg ts "$(date -u +%FT%TZ)" \
  --argjson healthy "$HEALTHY" \
  --argjson pass "$PASS" \
  --arg failed "${FAILED_IDS[*]}" \
  --arg warned "${WARN_IDS[*]}" \
  --arg skipped "${SKIP_IDS[*]}" \
  --arg remedies "${REMEDY_LOG# }" \
  --argjson pm2_online "${PM2_ONLINE:-0}" \
  --arg http_health "$H_CODE" \
  --argjson consec_fail "$(cat "$FAILC_FILE" 2>/dev/null || echo 0)" \
  '{ts:$ts, healthy:($healthy==1), checks_total:140, checks_passed:$pass,
    failed_checks:($failed|split(" ")|map(select(length>0)|tonumber)),
    advisory_checks:($warned|split(" ")|map(select(length>0)|tonumber)),
    na_checks:($skipped|split(" ")|map(select(length>0)|tonumber)),
    remedies_applied:($remedies|split(" ")|map(select(length>0))),
    pm2_online:$pm2_online, http_health_code:$http_health, consecutive_failures:$consec_fail}' \
  > "$STATUS_JSON" 2>/dev/null || true

[ "$HEALTHY" -eq 1 ] && exit 0 || exit 1
