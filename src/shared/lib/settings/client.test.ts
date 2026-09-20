import { test, expect, beforeEach } from 'bun:test';
import {
  primeChamberSettings,
  readChamberSetting,
  mergeChamberSettings,
  writeSetting,
  writeChamberSettings,
} from '@/shared/lib/settings/client';

const bootstrap = {
  omp_sidebar_sort: 'A-Z',
  desktopLayoutSizes: { sidebar: 268 },
  omp_chamber_settings: { theme: 'paper', streamTransport: 'websocket' },
};

beforeEach(() => {
  primeChamberSettings(bootstrap);
});

test('reads expose top-level keys and blob keys flat', () => {
  expect(readChamberSetting<string>('omp_sidebar_sort')).toBe('A-Z');
  expect(readChamberSetting<string>('theme')).toBe('paper');
  expect(readChamberSetting<string>('streamTransport')).toBe('websocket');
  expect(readChamberSetting('absent')).toBeUndefined();
});

test('the raw blob key is not exposed as a flat key', () => {
  expect(readChamberSetting('omp_chamber_settings')).toBeUndefined();
});

test('readChamberSetting accepts candidate key lists in priority order', () => {
  expect(readChamberSetting<string>(['missing', 'theme'])).toBe('paper');
  expect(readChamberSetting<string>(['theme', 'missing'])).toBe('paper');
  expect(readChamberSetting(['missing', 'alsoMissing'])).toBeUndefined();
});

test('mergeChamberSettings layers only the blob, never top-level keys', () => {
  const merged = mergeChamberSettings({ theme: 'fallback', fontSize: 14 });
  expect(merged.theme).toBe('paper');
  expect(merged.fontSize).toBe(14);
  expect((merged as Record<string, unknown>).omp_sidebar_sort).toBeUndefined();
  expect((merged as Record<string, unknown>).desktopLayoutSizes).toBeUndefined();
});

test('writeSetting updates the snapshot so the next read sees it', () => {
  writeSetting('omp_sidebar_sort', 'Z-A');
  expect(readChamberSetting<string>('omp_sidebar_sort')).toBe('Z-A');
});

test('writeChamberSettings updates flat keys and keeps sibling blob keys', () => {
  writeChamberSettings({ theme: 'noir' });
  expect(readChamberSetting<string>('theme')).toBe('noir');
  expect(readChamberSetting<string>('streamTransport')).toBe('websocket');
  expect(readChamberSetting('omp_chamber_settings')).toBeUndefined();
});

test('a later write does not clobber previously written flat keys', () => {
  writeSetting('showRightPanel', false);
  writeChamberSettings({ theme: 'noir' });
  expect(readChamberSetting<boolean>('showRightPanel')).toBe(false);
  expect(readChamberSetting<string>('theme')).toBe('noir');
});
