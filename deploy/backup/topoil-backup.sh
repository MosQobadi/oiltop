#!/usr/bin/env bash
#
# topoil-backup.sh — nightly backup of the Top Oil database and uploads volume.
#
# What it produces, per run, in $BACKUP_DIR:
#
#   topoil-<STAMP>-db.sql.gz.gpg        pg_dump | gzip | gpg (AES256, symmetric)
#   topoil-<STAMP>-uploads.tar.gz.gpg   tar of the uploads volume, same pipeline
#   topoil-<STAMP>.sha256               checksums of the two above
#
# Both artifacts are encrypted BEFORE they leave the machine, because the dump
# contains every customer's name, phone number and address. Every artifact is
# also copied off the VPS and its arrival is verified by checksum; nothing is
# pruned until that verification passes.
#
# Deliberately NOT here: restoring. Restoring is rehearsed separately (DR-002)
# and has its own runbook. Nor `docker compose down` in any form — this script
# never stops the stack, it only reads from it.
#
# Configuration: /etc/topoil/backup.conf (see backup.conf.example next to this
# file), overridable per-variable from the environment. The encryption
# passphrase lives in its own file, referenced by PASSPHRASE_FILE, and is never
# read into a variable, never logged, and never passed on a command line.
#
# Usage:
#   topoil-backup.sh                       run a backup
#   topoil-backup.sh --check-status [H]    exit non-zero if the last backup
#                                          failed or is older than H hours
#                                          (default 26). For OBS-002.
#   topoil-backup.sh --help

set -euo pipefail
umask 077

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CONF_FILE="${TOPOIL_BACKUP_CONF:-/etc/topoil/backup.conf}"

# Precedence, highest first: environment, then the config file, then the
# defaults below. The config file assigns unconditionally, so the environment's
# values are snapshotted before it is sourced and put back afterwards —
# otherwise `BACKUP_DIR=/tmp/x topoil-backup.sh` would be silently ignored,
# which is a nasty thing to discover while debugging a failed backup.
CONF_VARS="TOPOIL_DIR COMPOSE_FILE COMPOSE_ENV_FILE PG_SERVICE UPLOADS_VOLUME
TAR_IMAGE BACKUP_DIR STATUS_FILE LOG_FILE LOCK_DIR PASSPHRASE_FILE
BACKUP_REMOTE REMOTE_MODE SSH_OPTS PRUNE_REMOTE ALLOW_NO_REMOTE KEEP_DAILY
KEEP_WEEKLY KEEP_MONTHLY MIN_DB_BYTES MIN_UPLOADS_BYTES"

for _v in $CONF_VARS; do eval "_env_$_v=\${$_v:-}"; done
if [ -r "$CONF_FILE" ]; then
  # shellcheck source=/dev/null
  . "$CONF_FILE"
fi
for _v in $CONF_VARS; do
  eval "_e=\$_env_$_v"
  if [ -n "$_e" ]; then eval "$_v=\$_e"; fi
done
unset _v _e

TOPOIL_DIR="${TOPOIL_DIR:-/srv/topoil}"
COMPOSE_FILE="${COMPOSE_FILE:-$TOPOIL_DIR/docker-compose.prod.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$TOPOIL_DIR/.env.production}"
PG_SERVICE="${PG_SERVICE:-postgres}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-topoil_uploads}"
TAR_IMAGE="${TAR_IMAGE:-alpine:3.20}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/topoil}"
STATUS_FILE="${STATUS_FILE:-/var/lib/topoil/backup-status}"
LOG_FILE="${LOG_FILE:-$BACKUP_DIR/backup.log}"
LOCK_DIR="${LOCK_DIR:-$BACKUP_DIR/.lock}"
PASSPHRASE_FILE="${PASSPHRASE_FILE:-/etc/topoil/backup-passphrase}"

# The single destination variable. Its shape depends on REMOTE_MODE:
#   ssh     user@host:/srv/backups/topoil     (transport: scp/ssh)
#   rclone  remote:bucket/path                (transport: rclone)
#   dir     /mnt/backup-disk/topoil           (an ALREADY-MOUNTED remote
#                                              filesystem — not a local disk)
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
REMOTE_MODE="${REMOTE_MODE:-ssh}"
SSH_OPTS="${SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=20}"
# Split once into an array so every ssh/scp call below can quote it. BatchMode
# is the load-bearing flag: without it a scheduled run whose key stopped working
# hangs on a password prompt forever instead of failing.
# shellcheck disable=SC2206
SSH_ARGS=($SSH_OPTS)
PRUNE_REMOTE="${PRUNE_REMOTE:-1}"
# Escape hatch for a first local rehearsal only. Leaving this at 1 in
# production means there is no backup, only a second copy of the data on the
# machine that is about to die.
ALLOW_NO_REMOTE="${ALLOW_NO_REMOTE:-0}"

KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-3}"

# A dump smaller than this is not a Top Oil database; a truncated pipe or an
# empty schema should fail the run rather than quietly replace good backups.
MIN_DB_BYTES="${MIN_DB_BYTES:-65536}"
MIN_UPLOADS_BYTES="${MIN_UPLOADS_BYTES:-1024}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STARTED_EPOCH="$(date -u +%s)"
PREFIX="topoil-$STAMP"

RESULT="fail"
FAIL_REASON="interrupted before completion"
REMOTE_VERIFIED="no"
DB_BYTES=0
UPLOADS_BYTES=0
LOCK_HELD=0

# ---------------------------------------------------------------------------
# Logging — loud on failure, quiet on success
# ---------------------------------------------------------------------------

log() {
  printf '%s topoil-backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_FILE" 2>/dev/null || true
  printf '%s topoil-backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

err() {
  printf '%s topoil-backup: ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_FILE" 2>/dev/null || true
  printf '%s topoil-backup: ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
  command -v logger >/dev/null 2>&1 && logger -p daemon.err -t topoil-backup -- "$*" || true
}

die() {
  FAIL_REASON="$*"
  err "$*"
  exit 1
}

write_status() {
  local dir
  dir="$(dirname -- "$STATUS_FILE")"
  mkdir -p -- "$dir" 2>/dev/null || return 0
  {
    echo "status=$RESULT"
    echo "stamp=$STAMP"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "finished_epoch=$(date -u +%s)"
    echo "duration_seconds=$(( $(date -u +%s) - STARTED_EPOCH ))"
    echo "db_bytes=$DB_BYTES"
    echo "uploads_bytes=$UPLOADS_BYTES"
    echo "remote_mode=$REMOTE_MODE"
    echo "remote_configured=$([ -n "$BACKUP_REMOTE" ] && echo yes || echo no)"
    echo "remote_verified=$REMOTE_VERIFIED"
    if [ "$RESULT" = "ok" ]; then
      echo "error="
    else
      echo "error=$FAIL_REASON"
    fi
  } >"$STATUS_FILE".tmp && mv -f -- "$STATUS_FILE".tmp "$STATUS_FILE"
}

cleanup() {
  local code=$?
  rm -f -- "$BACKUP_DIR/$PREFIX"*.part 2>/dev/null || true
  if [ "$code" -ne 0 ] && [ "$RESULT" != "ok" ]; then
    err "BACKUP FAILED (exit $code): $FAIL_REASON"
  fi
  # A concurrent run must not overwrite the status of the run that owns the lock.
  if [ "$LOCK_HELD" = "1" ]; then
    write_status || true
    rm -rf -- "$LOCK_DIR" 2>/dev/null || true
  fi
  exit "$code"
}

# ---------------------------------------------------------------------------
# --check-status — the hook OBS-002 monitors
# ---------------------------------------------------------------------------

check_status() {
  local max_hours="${1:-26}" now age
  [ -r "$STATUS_FILE" ] || { echo "topoil-backup: no status file at $STATUS_FILE — backup has never run" >&2; exit 2; }
  local status="" finished_epoch=0 error=""
  while IFS='=' read -r k v; do
    case "$k" in
      status) status="$v" ;;
      finished_epoch) finished_epoch="$v" ;;
      error) error="$v" ;;
    esac
  done <"$STATUS_FILE"
  now="$(date -u +%s)"
  age=$(( (now - finished_epoch) / 3600 ))
  if [ "$status" != "ok" ]; then
    echo "topoil-backup: last run FAILED (${age}h ago): $error" >&2
    exit 2
  fi
  if [ "$age" -gt "$max_hours" ]; then
    echo "topoil-backup: last successful backup was ${age}h ago (limit ${max_hours}h)" >&2
    exit 2
  fi
  echo "topoil-backup: ok, last successful backup ${age}h ago"
  exit 0
}

usage() {
  sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

case "${1:-}" in
  --help|-h) usage ;;
  --check-status) shift; check_status "${1:-26}" ;;
  "") : ;;
  *) echo "unknown argument: $1 (try --help)" >&2; exit 64 ;;
esac

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

mkdir -p -- "$BACKUP_DIR" || { echo "cannot create $BACKUP_DIR" >&2; exit 1; }
trap cleanup EXIT

# Lock: safe to run twice sequentially, refuses to run twice at once.
if ! mkdir -- "$LOCK_DIR" 2>/dev/null; then
  if [ -r "$LOCK_DIR/pid" ] && kill -0 "$(cat -- "$LOCK_DIR/pid")" 2>/dev/null; then
    die "another backup is already running (pid $(cat -- "$LOCK_DIR/pid")); refusing to start a second"
  fi
  err "removing stale lock at $LOCK_DIR"
  rm -rf -- "$LOCK_DIR"
  mkdir -- "$LOCK_DIR" || die "cannot acquire lock at $LOCK_DIR"
fi
LOCK_HELD=1
echo $$ >"$LOCK_DIR/pid"

for bin in docker gpg gzip sha256sum tar; do
  command -v "$bin" >/dev/null 2>&1 || die "required command not found: $bin"
done

case "$REMOTE_MODE" in
  ssh) command -v scp >/dev/null 2>&1 || die "REMOTE_MODE=ssh needs scp (apt install openssh-client)" ;;
  rclone) command -v rclone >/dev/null 2>&1 || die "REMOTE_MODE=rclone needs rclone" ;;
  dir) : ;;
  *) die "REMOTE_MODE must be one of: ssh, rclone, dir (got '$REMOTE_MODE')" ;;
esac

[ -r "$COMPOSE_FILE" ] || die "compose file not readable: $COMPOSE_FILE"
[ -r "$COMPOSE_ENV_FILE" ] || die "env file not readable: $COMPOSE_ENV_FILE"
[ -r "$PASSPHRASE_FILE" ] || die "passphrase file not readable: $PASSPHRASE_FILE (see DEPLOYMENT.md §8)"

# A world-readable passphrase is the same as no passphrase.
perms="$(stat -c '%a' -- "$PASSPHRASE_FILE" 2>/dev/null || echo 600)"
case "$perms" in
  600|400) : ;;
  *) die "passphrase file $PASSPHRASE_FILE has mode $perms; must be 600 (chmod 600 it)" ;;
esac

if [ -z "$BACKUP_REMOTE" ]; then
  if [ "$ALLOW_NO_REMOTE" = "1" ]; then
    err "BACKUP_REMOTE is empty and ALLOW_NO_REMOTE=1 — this run produces a LOCAL COPY ONLY, which is not a backup"
  else
    die "BACKUP_REMOTE is not set; a backup that never leaves the machine is not a backup"
  fi
fi

# Only the two values needed to address the database. The password is never
# read — pg_dump runs inside the container over the unix socket, which the
# postgres image trusts, so no credential is passed or printed anywhere.
PG_USER="$(sed -n 's/^[[:space:]]*POSTGRES_USER[[:space:]]*=[[:space:]]*//p' "$COMPOSE_ENV_FILE" | tail -1 | tr -d '"'\''[:space:]')"
PG_DB="$(sed -n 's/^[[:space:]]*POSTGRES_DB[[:space:]]*=[[:space:]]*//p' "$COMPOSE_ENV_FILE" | tail -1 | tr -d '"'\''[:space:]')"
[ -n "$PG_USER" ] || die "POSTGRES_USER not found in $COMPOSE_ENV_FILE"
[ -n "$PG_DB" ] || die "POSTGRES_DB not found in $COMPOSE_ENV_FILE"

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

encrypt_to() {
  # stdin -> encrypted file. --passphrase-file keeps the passphrase off the
  # command line, where `ps` would show it.
  gpg --batch --yes --quiet --no-tty \
      --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" \
      --symmetric --cipher-algo AES256 --compress-algo none \
      --output "$1"
}

verify_artifact() {
  # Decrypts and decompresses to /dev/null: catches a truncated pipe, a bad
  # cipher, and a passphrase file that no longer opens its own backups. This
  # is an integrity check, not a restore (that is DR-002).
  local file="$1"
  gpg --batch --quiet --no-tty \
      --pinentry-mode loopback --passphrase-file "$PASSPHRASE_FILE" \
      --decrypt "$file" 2>/dev/null | gunzip -c >/dev/null
}

# ---------------------------------------------------------------------------
# Remote primitives — one per transport, everything above them is shared
# ---------------------------------------------------------------------------

remote_host() { printf '%s' "${BACKUP_REMOTE%%:*}"; }
remote_path() { printf '%s' "${BACKUP_REMOTE#*:}"; }

# The remote path expands here, on the client, which is what we want: it
# comes from backup.conf, not from the remote machine.
# shellcheck disable=SC2029
remote_put() {
  local src="$1" name="$2"
  case "$REMOTE_MODE" in
    ssh)
      ssh "${SSH_ARGS[@]}" "$(remote_host)" "mkdir -p '$(remote_path)'" || return 1
      scp "${SSH_ARGS[@]}" -q -- "$src" "$(remote_host):$(remote_path)/$name"
      ;;
    rclone) rclone copyto -- "$src" "$BACKUP_REMOTE/$name" ;;
    dir) mkdir -p -- "$BACKUP_REMOTE" && cp -- "$src" "$BACKUP_REMOTE/$name" ;;
  esac
}

# The remote path expands here, on the client, which is what we want: it
# comes from backup.conf, not from the remote machine.
# shellcheck disable=SC2029
remote_sha256() {
  local name="$1"
  case "$REMOTE_MODE" in
    ssh) ssh "${SSH_ARGS[@]}" "$(remote_host)" "sha256sum '$(remote_path)/$name'" 2>/dev/null | awk '{print $1}' ;;
    rclone) rclone sha256sum -- "$BACKUP_REMOTE/$name" 2>/dev/null | awk '{print $1}' ;;
    dir) sha256sum -- "$BACKUP_REMOTE/$name" 2>/dev/null | awk '{print $1}' ;;
  esac
}

# The remote path expands here, on the client, which is what we want: it
# comes from backup.conf, not from the remote machine.
# shellcheck disable=SC2029
remote_delete() {
  local name="$1"
  case "$REMOTE_MODE" in
    ssh) ssh "${SSH_ARGS[@]}" "$(remote_host)" "rm -f '$(remote_path)/$name'" ;;
    rclone) rclone deletefile -- "$BACKUP_REMOTE/$name" ;;
    dir) rm -f -- "$BACKUP_REMOTE/$name" ;;
  esac
}

# ---------------------------------------------------------------------------
# 1. Database
# ---------------------------------------------------------------------------

DB_FILE="$BACKUP_DIR/$PREFIX-db.sql.gz.gpg"
UPLOADS_FILE="$BACKUP_DIR/$PREFIX-uploads.tar.gz.gpg"
SHA_FILE="$BACKUP_DIR/$PREFIX.sha256"

log "starting backup $STAMP (db=$PG_DB, uploads volume=$UPLOADS_VOLUME)"

FAIL_REASON="pg_dump failed"
# Written to .part first so a half-finished artifact can never be mistaken for
# a backup, uploaded, or counted by the retention pass.
compose exec -T "$PG_SERVICE" pg_dump -U "$PG_USER" -d "$PG_DB" --no-password --clean --if-exists \
  | gzip -9 \
  | encrypt_to "$DB_FILE.part"

DB_BYTES="$(stat -c '%s' -- "$DB_FILE.part")"
[ "$DB_BYTES" -ge "$MIN_DB_BYTES" ] || die "database dump is only $DB_BYTES bytes (minimum $MIN_DB_BYTES) — refusing to call that a backup"

FAIL_REASON="database dump failed its decrypt/decompress check"
verify_artifact "$DB_FILE.part" || die "$FAIL_REASON"

if file -- "$DB_FILE.part" 2>/dev/null | grep -qi 'gzip compressed'; then
  die "database dump is not encrypted — refusing to send plaintext customer data off the machine"
fi

mv -f -- "$DB_FILE.part" "$DB_FILE"
log "database dump ok ($DB_BYTES bytes, encrypted)"

# ---------------------------------------------------------------------------
# 2. Uploads volume
# ---------------------------------------------------------------------------

FAIL_REASON="uploads volume archive failed"
docker run --rm -v "$UPLOADS_VOLUME":/data:ro "$TAR_IMAGE" tar czf - -C /data . \
  | encrypt_to "$UPLOADS_FILE.part"

UPLOADS_BYTES="$(stat -c '%s' -- "$UPLOADS_FILE.part")"
[ "$UPLOADS_BYTES" -ge "$MIN_UPLOADS_BYTES" ] || die "uploads archive is only $UPLOADS_BYTES bytes (minimum $MIN_UPLOADS_BYTES)"

FAIL_REASON="uploads archive failed its decrypt/decompress check"
verify_artifact "$UPLOADS_FILE.part" || die "$FAIL_REASON"

if file -- "$UPLOADS_FILE.part" 2>/dev/null | grep -qi 'gzip compressed'; then
  die "uploads archive is not encrypted"
fi

mv -f -- "$UPLOADS_FILE.part" "$UPLOADS_FILE"
log "uploads archive ok ($UPLOADS_BYTES bytes, encrypted)"

( cd -- "$BACKUP_DIR" && sha256sum -- "$(basename -- "$DB_FILE")" "$(basename -- "$UPLOADS_FILE")" >"$(basename -- "$SHA_FILE")" )

# ---------------------------------------------------------------------------
# 3. Off-box copy — the part that makes this a backup
# ---------------------------------------------------------------------------

if [ -n "$BACKUP_REMOTE" ]; then
  FAIL_REASON="off-box copy to $REMOTE_MODE destination failed"
  for f in "$DB_FILE" "$UPLOADS_FILE" "$SHA_FILE"; do
    name="$(basename -- "$f")"
    remote_put "$f" "$name" || die "could not copy $name to the off-box destination"
    local_sum="$(sha256sum -- "$f" | awk '{print $1}')"
    remote_sum="$(remote_sha256 "$name" || true)"
    [ -n "$remote_sum" ] || die "off-box copy of $name could not be checksummed at the destination — treating as not arrived"
    [ "$local_sum" = "$remote_sum" ] || die "off-box copy of $name is corrupt (local $local_sum, remote $remote_sum)"
    log "off-box copy verified: $name"
  done
  REMOTE_VERIFIED="yes"
else
  err "no off-box copy was made (ALLOW_NO_REMOTE=1)"
fi

# ---------------------------------------------------------------------------
# 4. Retention — runs only now, after a verified new backup exists
# ---------------------------------------------------------------------------
#
# 7 daily, 4 weekly, 3 monthly: a week of day-by-day recovery, a month of
# week-by-week, three months of month-by-month. Fourteen sets at the very most,
# about twelve in practice (the newest set fills the daily, weekly and monthly
# slot at once). A set measured on real data is ~46MB — a 5MB encrypted dump of
# 3,488 products and their fitment, plus a 41MB uploads archive — so the whole
# retention window is around 0.6GB on the VPS and the same again at the
# destination. Raise or lower KEEP_* in backup.conf as the uploads volume grows;
# it is the archive that will outrun the dump, not the other way round.

prune() {
  local stamps=() keep=() s
  for f in "$BACKUP_DIR"/topoil-*-db.sql.gz.gpg; do
    [ -e "$f" ] || continue
    s="$(basename -- "$f")"; s="${s#topoil-}"; s="${s%-db.sql.gz.gpg}"
    stamps+=("$s")
  done
  [ "${#stamps[@]}" -gt 0 ] || return 0

  # Newest first. The stamp is UTC basic ISO, so lexicographic == chronological.
  mapfile -t stamps < <(printf '%s\n' "${stamps[@]}" | sort -r)

  # Grandfather-father-son: keep the newest backup of each of the last
  # KEEP_DAILY days, of each of the last KEEP_WEEKLY ISO weeks, and of each of
  # the last KEEP_MONTHLY months. A period is represented by exactly one set,
  # so running this script by hand five times in one afternoon costs one slot,
  # not five — the older weekly and monthly points are not evicted by today.
  declare -A seen_day=() seen_week=() seen_month=()
  local days=0 weeks=0 months=0 day week month iso
  for s in "${stamps[@]}"; do
    day="${s:0:8}"
    iso="${s:0:4}-${s:4:2}-${s:6:2}"
    week="$(date -u -d "$iso" +%G-%V 2>/dev/null || echo "$day")"
    month="${s:0:6}"
    if [ -z "${seen_day[$day]+x}" ]; then
      seen_day[$day]=1
      if [ "$days" -lt "$KEEP_DAILY" ]; then days=$((days + 1)); keep+=("$s"); fi
    fi
    if [ -z "${seen_week[$week]+x}" ]; then
      seen_week[$week]=1
      if [ "$weeks" -lt "$KEEP_WEEKLY" ]; then weeks=$((weeks + 1)); keep+=("$s"); fi
    fi
    if [ -z "${seen_month[$month]+x}" ]; then
      seen_month[$month]=1
      if [ "$months" -lt "$KEEP_MONTHLY" ]; then months=$((months + 1)); keep+=("$s"); fi
    fi
  done

  local kept_list=" ${keep[*]:-} "
  for s in "${stamps[@]}"; do
    [ "$s" = "$STAMP" ] && continue                 # never the run that just succeeded
    [[ "$kept_list" == *" $s "* ]] && continue
    log "pruning backup set $s"
    for suffix in "-db.sql.gz.gpg" "-uploads.tar.gz.gpg" ".sha256"; do
      rm -f -- "$BACKUP_DIR/topoil-$s$suffix"
      if [ -n "$BACKUP_REMOTE" ] && [ "$PRUNE_REMOTE" = "1" ]; then
        remote_delete "topoil-$s$suffix" >/dev/null 2>&1 || err "could not prune topoil-$s$suffix at the destination"
      fi
    done
  done
}

if [ "$REMOTE_VERIFIED" = "yes" ] || [ "$ALLOW_NO_REMOTE" = "1" ]; then
  FAIL_REASON="retention pruning failed"
  prune
else
  err "skipping retention prune: the off-box copy was not verified"
fi

# ---------------------------------------------------------------------------

RESULT="ok"
FAIL_REASON=""
log "backup $STAMP complete in $(( $(date -u +%s) - STARTED_EPOCH ))s (db $DB_BYTES B, uploads $UPLOADS_BYTES B, off-box verified: $REMOTE_VERIFIED)"
