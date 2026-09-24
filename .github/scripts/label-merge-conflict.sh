#!/usr/bin/env bash
# Keeps `merge-conflict:true` in sync with GitHub's own mergeability verdict.
#
# This is a sweep, not a per-PR handler. Mergeability is computed asynchronously by
# GitHub after a head push, and one push to the base branch can conflict every open
# pull request at once, so asking about all of them is both simpler and more
# correct than trying to react to each event that might have changed the answer.
#
# A pull request whose state GitHub has not finished computing (`UNKNOWN`) keeps
# whatever label it has: the label asserts a known conflict, and "not computed yet"
# is not one. That is what keeps a sweep from flapping the label on every run.
#
# Requires GH_REPO (or a git checkout whose origin is the target repository).
set -euo pipefail

label="merge-conflict:true"
changed=0

while IFS=$'\t' read -r number mergeable labels; do
  [ -n "$number" ] || continue

  case "$mergeable" in
    CONFLICTING) wanted=true ;;
    MERGEABLE)   wanted=false ;;
    *)           echo "PR #${number}: mergeability ${mergeable:-unknown}, label left as is"; continue ;;
  esac

  has=false
  case ",${labels}," in
    *",${label},"*) has=true ;;
  esac
  if [ "$wanted" = "$has" ]; then continue; fi

  if [ "$wanted" = true ]; then
    gh pr edit "$number" --add-label "$label" >/dev/null
    echo "PR #${number}: conflicts with base -> ${label}"
  else
    gh pr edit "$number" --remove-label "$label" >/dev/null
    echo "PR #${number}: no conflict -> ${label} removed"
  fi
  changed=$((changed + 1))
done < <(gh pr list --state open --limit 200 \
  --json number,mergeable,labels \
  --jq '.[] | [.number, .mergeable, ([.labels[].name] | join(","))] | @tsv')

echo "merge-conflict: ${changed} pull request(s) updated"
