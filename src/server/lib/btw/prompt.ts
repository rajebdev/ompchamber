/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The side-question prompt.
 *
 * Derived from omp's own `/btw` template
 * (`packages/coding-agent/src/prompts/system/btw-user.md`), with one
 * deliberate divergence: the TUI's `/btw` runs the side child with
 * `--no-tools` and its prompt says "NEVER use tools". The chamber's panel
 * exposes a real access-control dropdown, which only means something when the
 * child HAS a tool surface — so the tool prohibition is dropped and the
 * approval mode governs what the side child may actually do.
 *
 * What is kept is the shape that makes a side question a side question: it
 * answers briefly and directly, and it never opens a follow-up dialogue of its
 * own — follow-ups are explicit user turns.
 *
 * The parent session's history is NOT part of this text: the side session
 * resumes the parent's transcript, so the context arrives as real provider
 * messages and keeps the parent's prompt-cache prefix.
 */

export function buildBtwPrompt(question: string): string {
  return [
    '<btw>',
    'Ephemeral side question for current interactive session.',
    'Answer briefly, directly; use conversation context already provided.',
    'NEVER ask follow-up questions.',
    'Question:',
    question,
    '</btw>',
  ].join('\n');
}
