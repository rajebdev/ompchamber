/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `summarizeProgress` decides what the composer's status line says while a
 * first-run model download runs, and the rule it encodes is not obvious from
 * the event shapes: omp reports TWO different quantities under the same
 * `progress` field — `progress_total` is the percent of the whole download,
 * `progress` is the percent of one file. Taking the per-file value as the
 * overall figure makes the number jump backwards every time the download moves
 * to the next file.
 */

import { describe, expect, test } from 'bun:test';
import { summarizeProgress } from '@/shared/lib/dictation/models';

describe('summarizeProgress', () => {
  test('a progress_total value is already a percent', () => {
    // Measured shape: progress 0.00282 alongside loaded 2243 / total 79664191.
    const summary = summarizeProgress({ status: 'progress_total', progress: 42 });
    expect(summary.percent).toBe(42);
    expect(summary.decoding).toBe(false);
  });

  test('a retrying download reports no figure rather than a stuck 100', () => {
    // `loaded` accumulates across attempts while `total` stays fixed, so a real
    // first-run fetch reached 2654 while files were still arriving. Pinning
    // that at 100 would sit on screen for the whole download and read as
    // "finished but stuck", so it becomes indeterminate instead.
    expect(summarizeProgress({ status: 'progress_total', progress: 2654 }).percent).toBeNull();
    expect(summarizeProgress({ status: 'progress_total', progress: -3 }).percent).toBeNull();
  });

  test('a figure inside 0..100 is shown', () => {
    expect(summarizeProgress({ status: 'progress_total', progress: 100 }).percent).toBe(100);
    expect(summarizeProgress({ status: 'progress_total', progress: 0 }).percent).toBe(0);
  });

  test('a per-file percent never becomes the overall figure', () => {
    // 27.45 is one file's completion; taken as the total it would show 27%
    // right after the total had already reported 86%.
    const summary = summarizeProgress({ status: 'progress', file: 'tokenizer.json', progress: 27.45 });
    expect(summary.percent).toBeNull();
    expect(summary.decoding).toBe(false);
  });

  test('an in-flight file reports no percent but is still a download', () => {
    const summary = summarizeProgress({ status: 'download', file: 'onnx/encoder_model_quantized.onnx' });
    expect(summary.percent).toBeNull();
    expect(summary.decoding).toBe(false);
  });

  test('once the files are fetched the wait is decoding, not downloading', () => {
    expect(summarizeProgress({ status: 'ready' }).decoding).toBe(true);
    expect(summarizeProgress({ status: 'done', file: 'config.json' }).decoding).toBe(true);
  });
});
