/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import {
  isNoticeRow,
  messageAnswerText,
  noticeIsAssistantText,
  reminderPartIndex,
} from '@/shared/lib/chat/notice-row';
import type { ChatMessageData } from '@/shared/types';

const row = (over: Partial<ChatMessageData>): ChatMessageData => ({
  id: 'n1',
  role: 'ai',
  content: '',
  ...over,
});

const answer = { model: 'deepseek-v4', usage: { totalTokens: 150_640 }, durationMs: 5_574 };

describe('reminderPartIndex', () => {
  test('finds a text block that is a reminder envelope', () => {
    expect(reminderPartIndex(['<system-reminder>\n10 todos open\n</system-reminder>'])).toBe(0);
  });

  test('ignores a tag quoted inside prose', () => {
    expect(reminderPartIndex(['Chip shows the peeled tag (`system-reminder`).'])).toBeUndefined();
    expect(reminderPartIndex(['Example: <system-reminder>…</system-reminder> then free text'])).toBeUndefined();
    expect(
      reminderPartIndex(['A wrapper is `<a>1</a>`; see <system-reminder> handling below']),
    ).toBeUndefined();
  });

  test('ignores an unclosed or mismatched tag pair', () => {
    expect(reminderPartIndex(['<system-reminder>\nno closing tag'])).toBeUndefined();
    expect(reminderPartIndex(['<system-reminder><b>10 todos</system-reminder>'])).toBeUndefined();
  });

  test('picks the envelope out of a multi-block turn', () => {
    expect(reminderPartIndex(['prose first', '<system-reminder>note</system-reminder>'])).toBe(1);
  });
});

describe('notice row classification', () => {
  test('a bare notice row is a notice card', () => {
    const notice = row({ notice: 'Late LSP diagnostics arrived after the edit returned.' });
    expect(noticeIsAssistantText(notice)).toBe(false);
    expect(isNoticeRow(notice)).toBe(true);
    expect(messageAnswerText(notice)).toBe('');
  });

  test('a notice row that kept the turn metadata is the answer', () => {
    const text = 'Implementasi selesai.\n\n## Aturan';
    const diverted = row({ notice: text, ...answer });
    expect(noticeIsAssistantText(diverted)).toBe(true);
    expect(isNoticeRow(diverted)).toBe(false);
    expect(messageAnswerText(diverted)).toBe(text);
  });

  test('a wrapped reminder stays a notice card even with turn metadata', () => {
    const reminder = row({ notice: '<system-reminder>10 todo items still open.</system-reminder>', ...answer });
    expect(noticeIsAssistantText(reminder)).toBe(false);
    expect(isNoticeRow(reminder)).toBe(true);
  });

  test('a task result stays a notice card', () => {
    const task = row({ notice: '<task-result id="Job" status="completed">done</task-result>', ...answer });
    expect(isNoticeRow(task)).toBe(true);
  });

  test('the live thinking-level stamp alone does not make a notice an answer', () => {
    expect(isNoticeRow(row({ notice: 'Job done.', thinkingLevel: 'high' }))).toBe(true);
  });

  test('an ordinary answer row is unaffected', () => {
    const plain = row({ content: 'Halo', ...answer });
    expect(isNoticeRow(plain)).toBe(false);
    expect(messageAnswerText(plain)).toBe('Halo');
  });

  test('an empty notice is not a notice row', () => {
    expect(isNoticeRow(row({ notice: '   ' }))).toBe(false);
    expect(isNoticeRow(row({}))).toBe(false);
  });
});
