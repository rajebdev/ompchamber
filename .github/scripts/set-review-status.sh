#!/usr/bin/env bash
# Sets exactly one readiness label on a pull request and removes every other
# `review:*` label. Readiness is a single state, never a stack: two readiness
# labels at once would leave the maintainer to guess which one is current.
#
# "-" expresses "no readiness state at all", which is what a draft pull request has
# before anyone has reviewed it.
#
# usage: set-review-status.sh <pr-number> <label|->
set -euo pipefail

pr="${1:?usage: set-review-status.sh <pr-number> <label|->}"
want="${2:?usage: set-review-status.sh <pr-number> <label|->}"
if [ "$want" = "-" ]; then want=""; fi

remove_args=()
while IFS= read -r label; do
  case "$label" in
    review:*)
      if [ "$label" != "$want" ]; then remove_args+=(--remove-label "$label"); fi
      ;;
  esac
done < <(gh pr view "$pr" --json labels --jq '.labels[].name')

if [ -n "$want" ]; then
  gh pr edit "$pr" ${remove_args[@]+"${remove_args[@]}"} --add-label "$want" >/dev/null
  echo "PR #${pr}: ${want}"
else
  if [ "${#remove_args[@]}" -gt 0 ]; then
    gh pr edit "$pr" "${remove_args[@]}" >/dev/null
  fi
  echo "PR #${pr}: readiness label cleared"
fi
