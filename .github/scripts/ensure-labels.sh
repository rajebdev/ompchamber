#!/usr/bin/env bash
# Creates or refreshes every label the bot workflows write.
#
# The repository's labels are owned by the workflow that reads them, not by a
# one-time manual bootstrap: a readiness label that the code writes but the
# repository does not have makes every review look like it failed, and a colour or
# description drift is invisible until someone looks. `gh label create --force`
# updates an existing label in place, so running this on each bot run keeps the two
# in sync with no separate migration step.
#
# Requires GH_REPO (or a git checkout whose origin is the target repository).
set -euo pipefail

# name|colour|description
LABELS="$(cat <<'TABLE'
review:pending|fbca04|Automated review queued for this pull request.
review:ready|0e8a16|Automated review found no blocker. Ready for maintainer review.
review:needs-evidence|fbca04|No blocker found, but required evidence is missing, stale or contradictory.
review:blocked|b60205|Automated review found a concrete blocker in the code.
review:human-required|5319e7|Automated review cannot clear this pull request. A maintainer must review it.
review:automation-failed|d93f0b|The review pipeline itself failed to produce a verifiable verdict.
size:XS|0e8a16|Under 10 changed lines (tests and lockfiles excluded).
size:S|5ebd3e|10-29 changed lines (tests and lockfiles excluded).
size:M|fbca04|30-99 changed lines (tests and lockfiles excluded).
size:L|fe7d37|100-499 changed lines (tests and lockfiles excluded).
size:XL|d93f0b|500-999 changed lines (tests and lockfiles excluded).
size:XXL|b60205|1,000+ changed lines (tests and lockfiles excluded).
merge-conflict:true|b60205|This pull request conflicts with its base branch.
needs-info|d4c5f9|Waiting on the reporter for information only they can provide.
stale|ededed|No activity for 28 days. Closes 7 days later.
pinned|0e8a16|Exempt from the stale sweep: the work is deliberately parked.
security|b60205|Security-sensitive. Never closed by the stale sweep.
TABLE
)"

count=0
while IFS='|' read -r name color description; do
  [ -n "$name" ] || continue
  gh label create "$name" --color "$color" --description "$description" --force >/dev/null
  count=$((count + 1))
done <<< "$LABELS"

echo "labels: ${count} managed"
