#!/usr/bin/env bash
# =============================================================================
#  code-up fast liveness probe  --  runs every ~15s from codeup-fast-health.timer
# =============================================================================
# The full watchdog runs every 2 minutes, which means an outage could go unseen
# for up to 120s before repair even began. This closes that gap.
#
# It deliberately contains NO repair logic of its own. When it sees the app is
# down it simply triggers the real watchdog immediately, so there is exactly one
# implementation of every remedy and no second thing that can "fix" the box in a
# way the watchdog does not know about.
#
# It takes the SAME lock the watchdog cron uses, so a scheduled run and a fast
# trigger can never execute concurrently.
# =============================================================================
set -u

APP_DIR="/home/ec2-user/Thefake"
export HOME="/home/ec2-user"
export USER="ec2-user"
export PATH="/home/ec2-user/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:$PATH"

cd "$APP_DIR" 2>/dev/null || exit 0

# Never fight a deploy: update.sh / npm run build take the cluster down on
# purpose and rewrite .next in place. That is not an outage.
pgrep -f 'next build|npm run build' >/dev/null 2>&1 && exit 0

probe() { curl -s -o /dev/null -m 4 -w '%{http_code}' "$1" 2>/dev/null; }
is_up()  { case "${1:-}" in 2??|3??) return 0;; *) return 1;; esac; }

# healthy on either endpoint -> nothing to do (the cheapest possible path)
is_up "$(probe http://127.0.0.1:3000/api/health)" && exit 0
is_up "$(probe http://127.0.0.1:3000/)"           && exit 0

# One confirmation pass. A single missed probe during a normal pm2 reload is not
# an outage, and triggering a repair on it would make deploys flap.
sleep 3
is_up "$(probe http://127.0.0.1:3000/api/health)" && exit 0
is_up "$(probe http://127.0.0.1:3000/)"           && exit 0

printf '[%s] [FAST] core HTTP down on two consecutive probes -- triggering watchdog\n' \
  "$(date '+%F %T')" >> "$APP_DIR/logs/watchdog.log" 2>/dev/null || true
logger -t codeup-fast-health "core HTTP down twice -- triggering watchdog" 2>/dev/null || true

# -n: if the watchdog is already running (cron tick or an earlier fast trigger),
# do nothing rather than stack a second pass on top of it.
exec /usr/bin/flock -n /tmp/thefake_watchdog.cron.lock \
     "$APP_DIR/scripts/server-watchdog.sh" >> "$APP_DIR/logs/watchdog.log" 2>&1
