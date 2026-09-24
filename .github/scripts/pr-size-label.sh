#!/usr/bin/env bash
# Sizes one pull request and applies exactly one `size:*` label.
#
# The count is the changed lines between the PR's base commit and its head, minus
# the paths that do not cost review time: tests, lockfiles and committed evidence
# images. A settings change that also touches twelve snapshots is still small.
#
# The head is fetched as passive git data into a private ref — never checked out,
# never built, never executed — so this is safe to run under `pull_request_target`
# for a fork, where the workflow holds repository secrets.
#
# usage: pr-size-label.sh <pr-number> <base-sha>
set -euo pipefail

pr="${1:?usage: pr-size-label.sh <pr-number> <base-sha>}"
base_sha="${2:?usage: pr-size-label.sh <pr-number> <base-sha>}"
head_ref="refs/remotes/bot-pr/${pr}"

EXCLUDES=(
  ":(glob,exclude)**/__tests__/**"
  ":(glob,exclude)**/test/**"
  ":(glob,exclude)**/tests/**"
  ":(glob,exclude)**/*.test.*"
  ":(glob,exclude)**/*.spec.*"
  ":(glob,exclude)**/*.snap"
  ":(glob,exclude)**/bun.lock"
  ":(glob,exclude)bun.lock"
)

# The base commit is normally already present (the workflow checks out the base
# repository); fetching it is a best effort for a shallow clone, not a requirement.
git fetch --no-tags origin "$base_sha" >/dev/null 2>&1 || true
git fetch --no-tags origin "+refs/pull/${pr}/head:${head_ref}" >/dev/null
head_sha="$(git rev-parse "$head_ref")"

sum_numstat() {
  awk -F'\t' '{ a = ($1 == "-" ? 0 : $1); d = ($2 == "-" ? 0 : $2); t += a + d } END { print t + 0 }'
}

diff_args=(diff --numstat --ignore-all-space --ignore-blank-lines "${base_sha}...${head_sha}")
total="$(git "${diff_args[@]}" | sum_numstat)"
counted="$(git "${diff_args[@]}" -- . "${EXCLUDES[@]}" | sum_numstat)"
# A pull request that only touches excluded paths is still sized, by what it touches.
effective=$(( counted == 0 ? total : counted ))

if   [ "$effective" -lt 10 ];   then size="size:XS"
elif [ "$effective" -lt 30 ];   then size="size:S"
elif [ "$effective" -lt 100 ];  then size="size:M"
elif [ "$effective" -lt 500 ];  then size="size:L"
elif [ "$effective" -lt 1000 ]; then size="size:XL"
else                                 size="size:XXL"
fi

remove_args=()
while IFS= read -r label; do
  case "$label" in
    size:*) if [ "$label" != "$size" ]; then remove_args+=(--remove-label "$label"); fi ;;
  esac
done < <(gh pr view "$pr" --json labels --jq '.labels[].name')

gh pr edit "$pr" ${remove_args[@]+"${remove_args[@]}"} --add-label "$size" >/dev/null

echo "PR #${pr}: ${effective} counted lines (${total} total) -> ${size}"
