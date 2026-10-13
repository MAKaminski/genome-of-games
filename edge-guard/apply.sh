#!/usr/bin/env bash
# Edge Guard: apply firewall.json to every project in a Vercel team.
#
#   VERCEL_TOKEN=... ./apply.sh --mode log|enforce [--plan pro|hobby] [--only name,name] [--dry-run]
#
# Non-destructive: it reads each project's active firewall config, then
# inserts or updates only the rules named "edge-guard: ..." and the two
# managed rulesets. IP blocks and any other custom rules are left alone. If a
# project would exceed Hobby's 3 custom rules it stops and says so rather than
# deleting anything. Writes a backup of every config it touches to backups/.
set -euo pipefail

TEAM_ID="${TEAM_ID:-team_3wz9UVlAlA9u7ZmvEFEAIhad}"
API="https://api.vercel.com"
MODE="" PLAN="pro" ONLY="" DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --plan) PLAN="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ "$MODE" == "log" || "$MODE" == "enforce" ]] || { echo "--mode log|enforce is required" >&2; exit 2; }
[[ -n "${VERCEL_TOKEN:-}" ]] || { echo "VERCEL_TOKEN is not set" >&2; exit 2; }
for bin in curl jq node; do command -v "$bin" >/dev/null || { echo "$bin is required" >&2; exit 2; }; done

HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HERE/backups"
auth=(-H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json")

api() {  # method path [body]  → prints body, fails loudly on HTTP >= 400 (except a 404 GET of a config that does not exist yet)
  local method="$1" path="$2" body="${3:-}" out code attempt
  for attempt in 1 2 3 4; do
    out="$(mktemp)"
    code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "${auth[@]}" ${body:+--data "$body"} "$API$path")
    # Vercel allows 50 firewall writes a minute per team. On a 429, wait out
    # the window and try again instead of failing the project.
    if [[ "$code" == 429 && $attempt -lt 4 ]]; then
      rm -f "$out"; echo "  … rate limited, waiting 61s" >&2; sleep 61; continue
    fi
    break
  done
  if [[ "$code" -ge 400 ]]; then
    if [[ "$method" == GET && "$code" == 404 ]]; then echo '{}'; rm -f "$out"; return 0; fi
    echo "HTTP $code from $method $path: $(cat "$out")" >&2; rm -f "$out"; return 1
  fi
  cat "$out"; rm -f "$out"
}

# Every project in the team, following pagination.
projects="[]" next=""
while :; do
  page="$(api GET "/v10/projects?teamId=$TEAM_ID&limit=100${next:+&from=$next}")"
  projects="$(jq -s '.[0] + [.[1].projects[] | {id, name}]' <(echo "$projects") <(echo "$page"))"
  next="$(echo "$page" | jq -r '.pagination.next // empty')"
  [[ -n "$next" ]] || break
done
if [[ -n "$ONLY" ]]; then
  projects="$(echo "$projects" | jq --arg only "$ONLY" '[.[] | select(.name as $n | ($only | split(",")) | index($n))]')"
fi
echo "mode=$MODE plan=$PLAN projects=$(echo "$projects" | jq length) dry_run=$DRY"

failed=0
while read -r pid pname; do
  want="$(node "$HERE/resolve.mjs" "$MODE" "$PLAN" "$pname")"
  have="$(api GET "/v1/security/firewall/config/active?projectId=$pid&teamId=$TEAM_ID")" || { failed=$((failed+1)); continue; }
  echo "$have" > "$HERE/backups/$pname.$(date -u +%Y%m%dT%H%M%SZ).json"

  others=$(echo "$have" | jq '[.rules // [] | .[] | select(.name | startswith("edge-guard: ") | not)] | length')
  if [[ "$PLAN" == hobby && $((others + $(echo "$want" | jq '.rules | length'))) -gt 3 ]]; then
    echo "✗ $pname: $others existing custom rule(s) + edge-guard would exceed Hobby's 3. Skipped; resolve by hand." >&2
    failed=$((failed+1)); continue
  fi

  # Only send what differs from the live config. Re-runs then cost almost no
  # writes, which matters under the 50-a-minute limit.
  ops="$(jq -c -n --argjson have "$have" --argjson want "$want" '
    def same($cur; $r): ($cur | {name, description, active, conditionGroup, action}) == $r;
    ( if $have.firewallEnabled == true then [] else [ {action: "firewallEnabled", id: null, value: true} ] end )
    + [ $want.rules[] as $r
        | ($have.rules // [] | map(select(.name == $r.name)) | first) as $cur
        | if $cur == null then {action: "rules.insert", id: null, value: $r}
          elif same($cur; $r) then empty
          else {action: "rules.update", id: $cur.id, value: $r} end ]
    + [ $want.managedRules | to_entries[]
        | select(($have.managedRules // {})[.key] as $m
                 | ($m.active != .value.active) or ($m.action != .value.action))
        | {action: "managedRules.update", id: .key, value: .value} ]')"

  n=$(echo "$ops" | jq length)
  if [[ $DRY -eq 1 ]]; then
    echo "• $pname: would apply $n change(s)"
    echo "$ops" | jq -c '.[] | {action, id, rule: (if (.value | type) == "object" then .value.name else null end)}'
    continue
  fi
  if [[ $n -eq 0 ]]; then echo "✓ $pname (already up to date)"; continue; fi
  ok=1
  while read -r op; do
    api PATCH "/v1/security/firewall/config?projectId=$pid&teamId=$TEAM_ID" "$op" >/dev/null || { ok=0; break; }
    sleep 1.3   # stay under 50 writes a minute
  done < <(echo "$ops" | jq -c '.[]')
  if [[ $ok -eq 1 ]]; then echo "✓ $pname ($n change(s))"; else echo "✗ $pname" >&2; failed=$((failed+1)); fi
done < <(echo "$projects" | jq -r '.[] | "\(.id) \(.name)"')

echo "done: $failed project(s) failed"
[[ $failed -eq 0 ]]
