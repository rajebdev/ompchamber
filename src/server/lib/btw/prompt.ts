/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The side-question prompt. Byte-for-byte the template omp's own `/btw`
 * sends (`packages/coding-agent/src/prompts/system/btw-user.md`): the side
 * answer must stay short, must not reach for tools, and must not open a
 * follow-up dialogue of its own — follow-ups are explicit user turns.
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
    'NEVER use tools.',
    'NEVER ask follow-up questions.',
    'Question:',
    question,
    '</btw>',
  ].join('\n');
}
