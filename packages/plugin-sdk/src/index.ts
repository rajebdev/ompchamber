/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The panel-plugin contract.
 *
 * Two halves, and the split is what keeps a plugin bundle small:
 *
 * - This root export is TYPE-ONLY plus the two `definePluginApp` helpers. It is
 *   the shape a plugin author compiles against and it costs a few bytes,
 *   because nothing here runs.
 * - `@ompchamber/plugin-sdk/app` is the same contract — the build marks it
 *   external, and the host answers it from its own runtime, so a plugin never
 *   bundles a second copy of anything the host already has.
 *
 * The contract itself lives in `./app`; this module only decides what the root
 * entry exposes.
 */

export * from './app';
