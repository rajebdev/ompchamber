/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility to determine whether the application is running in MOCK mode.
 * 
 * - When MOCK=true (or MOCK=1): all data uses mock / simulated presets (demo chat traces, mock token analytics, mock settings presets).
 * - When MOCK=false (or MOCK=0): all data uses real data (real SQLite persistence, real token calculations, real workspace state).
 */
export function isMockMode(): boolean {
  const envVal = (process.env.MOCK || '').trim().toLowerCase();
  
  if (envVal === 'false' || envVal === '0' || envVal === 'off' || envVal === 'no') {
    return false;
  }
  
  if (envVal === 'true' || envVal === '1' || envVal === 'on' || envVal === 'yes') {
    return true;
  }

  // Default to true for sandbox / preview demo mode if not explicitly set to false
  return true;
}

export function getMockModeInfo(): { isMock: boolean; rawEnv: string } {
  const isMock = isMockMode();
  return {
    isMock,
    rawEnv: process.env.MOCK || (isMock ? 'true (default)' : 'false'),
  };
}
