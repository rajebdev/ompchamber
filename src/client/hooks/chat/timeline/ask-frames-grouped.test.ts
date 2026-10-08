/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The GROUPED ask frame (`method:"ask"`, sent after `set_ask_dialog`).
 *
 * It carries every question of one tool call and no `title`, so the title walk
 * `splitAskFrames` has always used can never place it. It is matched by the
 * question ids omp puts in both the frame and the tool call's arguments, and it
 * is placed on EACH question it names rather than in a single bucket, because
 * one dialog answers all of them.
 */

import { describe, expect, test } from 'bun:test';

import { splitAskFrames } from '@/client/hooks/chat/timeline/ask-frames';
import type { ChatMessageData } from '@/shared/types';
import type { ExtensionUiDialogRequest } from '@/shared/types/omp/agent';

function askTool() {
  return {
    id: 'call-ask',
    type: 'custom' as const,
    title: 'ask',
    name: 'ask',
    input: {
      questions: [
        { id: 'q1', question: 'Pick colors', options: [{ label: 'red' }, { label: 'green' }], multi: true },
        { id: 'q2', question: 'Pick a size', options: [{ label: 's' }, { label: 'm' }] },
      ],
    },
    status: 'running' as const,
  };
}

function message(): ChatMessageData {
  return { id: 'm1', role: 'ai', content: '', toolCalls: [askTool()] } as unknown as ChatMessageData;
}

const grouped: ExtensionUiDialogRequest = {
  type: 'extension_ui_request',
  id: 'frame-1',
  method: 'ask',
  title: '',
  questions: [
    { id: 'q1', question: 'Pick colors', options: [{ label: 'red' }, { label: 'green' }], multi: true },
    { id: 'q2', question: 'Pick a size', options: [{ label: 's' }, { label: 'm' }] },
  ],
};

describe('splitAskFrames with a grouped ask frame', () => {
  test('claims the tool by question id and lands on every question', () => {
    const split = splitAskFrames([message()], [grouped], true);
    const groups = split.framesByTool.get('call-ask');
    expect(groups).toBeDefined();
    expect(groups?.length).toBe(2);
    // The same frame is on BOTH questions — one dialog answers both.
    expect(groups?.[0]).toEqual([grouped]);
    expect(groups?.[1]).toEqual([grouped]);
    // And it is not left over as modal material.
    expect(split.modalRequest).toBeNull();
  });

  test('an unowned grouped frame stays for the modal', () => {
    const stranger: ExtensionUiDialogRequest = {
      ...grouped,
      id: 'frame-2',
      questions: [{ id: 'nope', question: 'Unknown', options: [] }],
    };
    const split = splitAskFrames([message()], [stranger], true);
    expect(split.framesByTool.get('call-ask')).toBeUndefined();
    expect(split.modalRequest).toBe(stranger);
  });
});
