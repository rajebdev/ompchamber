#!/usr/bin/env bash
# Runs one headless omp session as the repository bot.
#
# Three inputs, one job each: the persona file carries the identity and the output
# contract, the overlay carries the tool policy, and the prompt arrives on stdin.
# omp reads a non-TTY stdin as its initial prompt, which keeps a prompt that quotes
# a pull request out of the process argument list and out of shell quoting.
#
# Two ways to reach a model, chosen by whether BOT_API_BASEURL is set:
#
#   1. A provider omp already knows (`BOT_API_BASEURL` unset). The credential is handed
#      over as the environment variable that provider reads, which is the only thing
#      that satisfies omp's startup credential check on a bare runner:
#        BOT_MODEL        (variable) the model selector, e.g. "deepseek/deepseek-chat"
#        BOT_API_KEY_ENV  (variable) the env var that provider reads, e.g.
#                                    "DEEPSEEK_API_KEY"; must match BOT_MODEL's provider
#
#   2. An OpenAI-compatible gateway (`BOT_API_BASEURL` set — kenari, LiteLLM, a local
#      proxy). omp has no provider for an arbitrary base URL, so this script declares
#      one in a private profile's models.yml from
#      `.github/bot/provider-models.yml`, then passes the key with `--api-key`:
#        BOT_API_BASEURL  (variable) base URL including the version segment,
#                                    e.g. "https://kenari.id/v1"
#        BOT_MODEL        (variable) model id served by that gateway; a "prefix/id"
#                                    selector is accepted and the id is what is used
#
#      `--api-key` was verified to override the file's placeholder value, and the
#      placeholder cannot be dropped (omp refuses to start with no credential), which
#      is why the real key never has to be written to the runner's disk.
#
# BOT_API_KEY (secret) is mandatory in both modes; GH_TOKEN / GITHUB_TOKEN must be set
# by the caller, which passes the GitHub App installation token so comments land as the
# bot rather than as github-actions.
#
# BOT_THINKING (optional, default `high`) is the omp thinking level. On the built-in
# provider path the model declares its own supported efforts and the level is clamped to
# them; on the gateway path nothing reaches the provider unless the model entry in the
# template declares `reasoning: true`, which it does (verified against a stub: without it
# `--thinking` is accepted and dropped).
#
# usage: run-omp-bot.sh <persona-file> <overlay-file>
#   env: BOT_MODEL, BOT_API_KEY, BOT_API_KEY_ENV | BOT_API_BASEURL, BOT_TOOLS,
#        BOT_MAX_TIME, BOT_THINKING, BOT_PROFILE
set -euo pipefail

persona="${1:?usage: run-omp-bot.sh <persona-file> <overlay-file>}"
overlay="${2:?usage: run-omp-bot.sh <persona-file> <overlay-file>}"

: "${BOT_MODEL:?BOT_MODEL is required: set the repository variable to a model selector}"
: "${BOT_API_KEY:?BOT_API_KEY is required: set the repository secret to the provider key}"
: "${GH_TOKEN:?GH_TOKEN is required: the workflow must pass the bot app installation token}"

tools="${BOT_TOOLS:-read,glob,grep,bash}"
max_time="${BOT_MAX_TIME:-30m}"
thinking="${BOT_THINKING:-high}"
provider_template="${BOT_PROVIDER_TEMPLATE:-.github/bot/provider-models.yml}"

# An unusable level is rejected by omp mid-run with a less obvious message, so it is
# checked here where the fix (the repository variable) is named.
case "$thinking" in
  off|minimal|low|medium|high|xhigh|max|auto) ;;
  *)
    echo "::error::BOT_THINKING must be one of off, minimal, low, medium, high, xhigh, max, auto (got: ${thinking})" >&2
    exit 1
    ;;
esac

if [ ! -f "$persona" ]; then echo "::error::persona not found: ${persona}" >&2; exit 1; fi
if [ ! -f "$overlay" ]; then echo "::error::policy overlay not found: ${overlay}" >&2; exit 1; fi

api_key_args=()

if [ -n "${BOT_API_BASEURL:-}" ]; then
  model_id="${BOT_MODEL##*/}"
  if [ -z "$model_id" ]; then
    echo "::error::BOT_MODEL must name a model id, not just a provider prefix: ${BOT_MODEL}" >&2
    exit 1
  fi
  if [ ! -f "$provider_template" ]; then
    echo "::error::provider template not found: ${provider_template}" >&2
    exit 1
  fi

  # A private profile keeps this run's provider catalogue, sessions and blobs away from
  # anything else on the machine; PI_CONFIG_DIR is a directory name under $HOME, not a
  # path.
  profile="${BOT_PROFILE:-.omp-bot-ci}"
  agent_dir="$HOME/${profile}/agent"
  mkdir -p "$agent_dir"
  sed -e "s|__BASE_URL__|${BOT_API_BASEURL}|g" -e "s|__MODEL_ID__|${model_id}|g" \
    "$provider_template" > "$agent_dir/models.yml"
  export PI_CONFIG_DIR="$profile"

  model_selector="botgw/${model_id}"
  api_key_args=(--api-key "$BOT_API_KEY")
  echo "provider mode: openai-compatible gateway via ${profile}/agent/models.yml"
else
  key_env="${BOT_API_KEY_ENV:?BOT_API_KEY_ENV is required when BOT_API_BASEURL is unset: name the env var that the BOT_MODEL provider reads}"
  export "${key_env}=${BOT_API_KEY}"
  model_selector="$BOT_MODEL"
  echo "provider mode: built-in provider ${BOT_MODEL%%/*} via ${key_env}"
fi

# There is no terminal here. A PTY path would fall back at best and hang at worst, and
# automatic title generation would spend a model call on a session name nobody reads.
export PI_NO_PTY=1
export PI_NO_TITLE=1

started="$(date -u +%s)"
set +e
omp -p \
  --no-extensions \
  --tools "$tools" \
  --config "$overlay" \
  --append-system-prompt "$persona" \
  --model "$model_selector" \
  --thinking "$thinking" \
  ${api_key_args[@]+"${api_key_args[@]}"} \
  --max-time "$max_time"
status=$?
set -e

echo "omp exit=${status} duration=$(( $(date -u +%s) - started ))s"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### omp run"
    echo
    echo "- exit: \`${status}\`"
    echo "- duration: \`$(( $(date -u +%s) - started ))s\`"
    echo "- model: \`${model_selector}\`"
    echo "- thinking: \`${thinking}\` (reaches the provider only when the model declares reasoning support; on the gateway path that is the template)"
    echo "- tools: \`${tools}\`"
  } >> "$GITHUB_STEP_SUMMARY"
fi

exit "$status"
