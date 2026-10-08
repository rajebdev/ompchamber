import type { ToolCallData } from '@/shared/types';

/**
 * The internal-URL tool calls the virtual-devices demo session renders: the
 * `proc://` device (a status read and a stop) and a `read xd://<device>` docs
 * read.
 *
 * They live beside `virtual-devices-session.ts` rather than inside it because
 * that file is at the repo's per-file size ceiling, and because the shapes below
 * are the ones a reader has to be able to tell apart: a proc status read (a
 * daemon snapshot plus its terminal-formatted log), a proc stop (the same
 * daemon, exited, with an exit code), and an `xd://` doc read (prose with no
 * language). All are verbatim `details` bags measured off real omp results.
 */
export const internalUrlCalls: ToolCallData[] = [
  {
    id: 'call_dev_proc_read',
    type: 'read',
    name: 'read',
    title: 'read — proc://ompchamber-dev',
    target: 'proc://ompchamber-dev',
    input: { path: 'proc://ompchamber-dev' },
    status: 'success',
    duration: '38ms',
    details: {
      proc: {
        daemon: {
          name: 'ompchamber-dev',
          id: '7bf84d40-eeeb-4119-8e9d-86bdcd180c59',
          state: 'ready',
          pid: 22985,
          createdAt: 1_791_433_388_035,
          startedAt: 1_791_433_388_038,
          readyAt: 1_791_433_388_270,
          restartCount: 0,
          outputBytes: 4500,
          readyMatch: 'listening on',
          persist: false,
          detached: false,
        },
        log: '$ bun run --hot src/server/index.ts\n[ompchamber] mock mode: false\n[ompchamber] listening on http://127.0.0.1:3001',
        terminalRows: [
          '\u001b[0m\u001b[2;38;5;5m$\u001b[0m \u001b[0m\u001b[1;2mbun run --hot src/server/index.ts',
          '\u001b[0m[ompchamber] mock mode: false',
          '\u001b[0m[ompchamber] listening on http://127.0.0.1:3001',
        ],
      },
    },
    output: 'ompchamber-dev [service] — ready — pid 22985\n$ bun run --hot src/server/index.ts\n[ompchamber] mock mode: false\n[ompchamber] listening on http://127.0.0.1:3001',
  },
  {
    id: 'call_dev_proc_kill',
    type: 'write',
    name: 'write',
    title: 'write — proc://ompchamber-dev/kill',
    target: 'proc://ompchamber-dev/kill',
    input: { path: 'proc://ompchamber-dev/kill', content: null },
    status: 'success',
    duration: '11ms',
    details: {
      proc: {
        action: 'stop',
        daemon: {
          name: 'ompchamber-dev',
          id: '7bf84d40-eeeb-4119-8e9d-86bdcd180c59',
          state: 'exited',
          createdAt: 1_791_433_388_035,
          startedAt: 1_791_433_388_038,
          readyAt: 1_791_433_388_270,
          exitedAt: 1_791_434_377_079,
          exitCode: 0,
          restartCount: 0,
          outputBytes: 4540,
          persist: false,
          detached: false,
        },
      },
    },
    output: 'Stopped ompchamber-dev [service] — exited — up 16m29s',
  },
  {
    id: 'call_dev_xd_doc_read',
    type: 'read',
    name: 'read',
    title: 'read — xd://eval/browser',
    target: 'xd://eval/browser',
    input: { path: 'xd://eval/browser' },
    status: 'success',
    duration: '22ms',
    details: {
      contentType: 'text/plain',
      totalLines: 77,
      displayContent: {
        text: 'Drive real Chromium tabs from JavaScript or Python Eval with the global `browser` object.\n\n<instruction>\n- Static content? Use `read`. Use `browser` for JavaScript execution, authenticated sessions, and interactive actions.',
        startLine: 1,
        lineNumbers: [1, 2, 3, 4, 5],
      },
      meta: { source: { type: 'internal', value: 'xd://eval/browser' } },
    },
    output: '1|Drive real Chromium tabs from JavaScript or Python Eval with the global `browser` object.\n2|\n3|<instruction>\n4|- Static content? Use `read`. Use `browser` for JavaScript execution, authenticated sessions, and interactive actions.',
  },
];
