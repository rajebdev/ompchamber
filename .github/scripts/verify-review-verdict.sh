#!/usr/bin/env bash
# The gate between a model's prose and a repository label.
#
# A review comment is advisory data until this script has re-read it from the API
# and checked every claim in it against the workflow's own facts. Nothing else in
# the pipeline trusts the model: the comment must end with a machine marker, the
# HEAD in that marker must be the HEAD that was requested, the HEAD must still be
# the current one, and the human-readable verdict and reviewed-HEAD lines must agree
# with it. Only then is the readiness label written.
#
# It fails closed. Every mismatch exits non-zero *before* a label is touched, so the
# workflow can mark `review:automation-failed` rather than publish a verdict it
# cannot vouch for.
#
# usage: verify-review-verdict.sh <pr-number> <expected-head-sha> <review-started-at>
#   env: GH_REPO, BOT_LOGIN (optional; resolved from the app token when unset)
# out: verdict=<v> and label=<review:…> on stdout, and in $GITHUB_OUTPUT when set
set -euo pipefail

pr="${1:?usage: verify-review-verdict.sh <pr-number> <head-sha> <started-at>}"
expected_head="${2:?usage: verify-review-verdict.sh <pr-number> <head-sha> <started-at>}"
started_at="${3:?usage: verify-review-verdict.sh <pr-number> <head-sha> <started-at>}"

fail() {
  echo "::error::$1" >&2
  exit 1
}

bot_login="${BOT_LOGIN:-}"
if [ -z "$bot_login" ]; then
  bot_login="$(gh api user --jq '.login' 2>/dev/null)" \
    || fail "could not resolve the bot login from the app token"
fi

comments_raw="$(gh api "repos/${GH_REPO}/issues/${pr}/comments" --paginate)" \
  || fail "could not read the pull request comments"

comment="$(printf '%s' "$comments_raw" | jq -s \
  --arg started "$started_at" --arg login "$bot_login" \
  '[.[][] | select(.user.login == $login and .created_at >= $started
      and ((.body // "") | contains("<h3>Code Review Summary</h3>"))
      and ((.body // "") | contains("<!-- omc-review-meta ")))] | last // empty')" \
  || fail "could not parse the pull request comments"

if [ -z "$comment" ] || [ "$comment" = "null" ]; then
  fail "no structured review comment by ${bot_login} posted since ${started_at}"
fi

body="$(printf '%s' "$comment" | jq -r '.body')"
last_line="$(printf '%s\n' "$body" | awk 'NF { line = $0 } END { print line }')"

# Tolerant on whitespace, strict on shape: the generator is a language model, and a
# parser that is stricter than the documented format turns a cosmetic slip into a
# failed pipeline. Keys, values and the final-line position are what actually matter.
marker_re='^<!-- omc-review-meta \{[[:space:]]*"head":[[:space:]]*"[0-9a-f]{40}"[[:space:]]*,[[:space:]]*"verdict":[[:space:]]*"(pass|needs-evidence|blocked|human-review-required)"[[:space:]]*\}[[:space:]]*-->$'
printf '%s' "$last_line" | grep -Eq "$marker_re" \
  || fail "review marker missing, malformed, or not the final line: ${last_line}"

verdict="$(printf '%s' "$last_line" | sed -E 's/.*"verdict":[[:space:]]*"([a-z-]+)".*/\1/')"
reviewed_head="$(printf '%s' "$last_line" | sed -E 's/.*"head":[[:space:]]*"([0-9a-f]{40})".*/\1/')"

if [ "$reviewed_head" != "$expected_head" ]; then
  fail "review targets ${reviewed_head}, expected ${expected_head}"
fi

current_head="$(gh pr view "$pr" --json headRefOid --jq '.headRefOid')"
if [ "$current_head" != "$expected_head" ]; then
  fail "PR HEAD moved from ${expected_head} to ${current_head} during review"
fi

display="$(printf '%s' "$verdict" | tr '[:lower:]-' '[:upper:]_')"

# These checks read the comment the way a maintainer does, ignoring markdown decoration.
# A live run posted a correct review whose backticks and bold markers were dropped on the
# way, and a gate that rejects a correct comment over formatting turns a finished review
# into a wasted run plus an `automation-failed` label. The machine contract is the marker
# above; these only prove the human-readable lines agree with it, so each check requires
# the label, then the value as a complete token.
printf '%s\n' "$body" | grep -Eq "Verdict:[^A-Za-z]*${display}([^A-Za-z]|\$)" \
  || fail "human-readable verdict missing or disagreeing with the marker (${verdict})"
printf '%s\n' "$body" | grep -Eq "Reviewed HEAD:[^0-9a-f]*${expected_head}([^0-9a-f]|\$)" \
  || fail "review comment does not identify the reviewed HEAD"
printf '%s\n' "$body" | grep -Fqi 'for the maintainer:' \
  || fail "review comment has no maintainer line"

case "$verdict" in
  pass)                   label="review:ready" ;;
  needs-evidence)         label="review:needs-evidence" ;;
  blocked)                label="review:blocked" ;;
  human-review-required)  label="review:human-required" ;;
  *)                      fail "unsupported verdict: ${verdict}" ;;
esac

remove_args=()
while IFS= read -r current; do
  case "$current" in
    review:*) if [ "$current" != "$label" ]; then remove_args+=(--remove-label "$current"); fi ;;
  esac
done < <(gh pr view "$pr" --json labels --jq '.labels[].name')

gh pr edit "$pr" ${remove_args[@]+"${remove_args[@]}"} --add-label "$label" >/dev/null

echo "verdict=${verdict} label=${label} head=${reviewed_head}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "verdict=${verdict}"
    echo "label=${label}"
  } >> "$GITHUB_OUTPUT"
fi
