#!/usr/bin/env bash
# Decides whether a push-triggered re-review should run.
#
# A command from a maintainer always runs; only `synchronize` is throttled. Without
# the window, an author who pushes four times in ten minutes buys four reviews of
# four intermediate commits, and the last one is the only review anyone reads.
#
# The clock starts at the last *structured* review comment — the one carrying the
# verdict marker, posted by a bot — not at any bot comment, so a help or summarize
# reply cannot make the repository look freshly reviewed.
#
# usage: review-throttle.sh <pr-number>
#   env: EVENT_NAME, EVENT_ACTION, THROTTLE_SECONDS (default 900), GH_REPO
# out: skip=false | skip=true   (also printed to $GITHUB_OUTPUT when set)
set -euo pipefail

# The window comparison below is string-based, so the collation must be byte order.
export LC_ALL=C

pr="${1:?usage: review-throttle.sh <pr-number>}"
event="${EVENT_NAME:-}"
action="${EVENT_ACTION:-}"
window="${THROTTLE_SECONDS:-900}"

skip=false
if [ "$event" = "pull_request_target" ] && [ "$action" = "synchronize" ]; then
  # The throttle is an optimization, not a gate: if the comment list cannot be read
  # the review runs, because a wasted review costs less than a pull request that never
  # gets one.
  last="$(gh api "repos/${GH_REPO}/issues/${pr}/comments" --paginate 2>/dev/null | jq -s -r \
    '[.[][] | select(.user.type == "Bot" and ((.body // "") | contains("<!-- omc-review-meta "))) | .created_at] | last // empty' 2>/dev/null)" || last=""

  if [ -z "$last" ]; then
    echo "No readable previous structured review; running."
  else
    # The cutoff is built with the host's own date tooling (GNU `-d @epoch` on the
    # runner, BSD `-r epoch` elsewhere) and then compared as a string: GitHub's
    # timestamps are fixed-width UTC ISO-8601, so string order is time order and no
    # timestamp parsing is needed.
    now="$(date -u +%s)"
    if date -u -d "@${now}" +%s >/dev/null 2>&1; then
      cutoff="$(date -u -d "@$(( now - window ))" +'%Y-%m-%dT%H:%M:%SZ')"
    else
      cutoff="$(date -u -r "$(( now - window ))" +'%Y-%m-%dT%H:%M:%SZ')"
    fi

    if [[ "$last" > "$cutoff" ]]; then
      echo "Last review was posted after ${cutoff}; push-triggered re-review skipped (window ${window}s)."
      skip=true
    fi
  fi
fi

echo "skip=${skip}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "skip=${skip}" >> "$GITHUB_OUTPUT"; fi
