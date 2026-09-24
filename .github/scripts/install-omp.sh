#!/usr/bin/env bash
# Installs the pinned oh-my-pi (`omp`) CLI that every AI-backed bot workflow runs.
#
# The version is pinned on purpose: the bot's verdict is a contract (marker shape,
# label mapping) that is verified by these scripts, but its *judgement* comes from
# omp, and a newer omp can change how it reads a diff. A run must be reproducible
# from the repository alone, so the pin lives here rather than in a floating major.
#
# The install itself is three attempts of one global Bun install — GitHub's npm
# mirror and the platform-native package (`@oh-my-pi/pi-natives-linux-x64`) both
# flake under load, and a flake is not a review failure.
set -euo pipefail

OMP_VERSION="${OMP_VERSION:-18.3.0}"
PACKAGE="@oh-my-pi/pi-coding-agent"
WANTED="omp/${OMP_VERSION}"

if command -v omp >/dev/null 2>&1 && [ "$(omp --version 2>/dev/null | awk '{print $1}')" = "$WANTED" ]; then
  echo "omp ${OMP_VERSION} already installed"
  exit 0
fi

status=1
for attempt in 1 2 3; do
  echo "Installing ${PACKAGE}@${OMP_VERSION} (attempt ${attempt}/3)"
  if bun add -g "${PACKAGE}@${OMP_VERSION}"; then
    status=0
    break
  fi
  status=$?
  if [ "$attempt" -lt 3 ]; then sleep "$((attempt * 5))"; fi
done

if [ "$status" -ne 0 ]; then
  echo "::error::could not install ${PACKAGE}@${OMP_VERSION} after 3 attempts" >&2
  exit 1
fi

installed="$(omp --version 2>/dev/null | awk '{print $1}')"
if [ "$installed" != "$WANTED" ]; then
  echo "::error::installed omp is ${installed:-unknown}, expected ${WANTED}" >&2
  exit 1
fi

echo "omp ${OMP_VERSION} ready"
