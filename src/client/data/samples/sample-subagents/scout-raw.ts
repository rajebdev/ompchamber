/**
 * Raw subagent transcript JSONL frames for the scout subagent.
 * Session ID: 01a08ecc-1c26-70a2-9f74-8199f14f131a
 */

export const SAMPLE_SCOUT_SUBAGENT_ID = '01a08ecc-1c26-70a2-9f74-8199f14f131a';

export const rawScoutSubagentEvents: Record<string, unknown>[] = [
  {
    type: 'title',
    v: 1,
    title: '',
    updatedAt: '2026-09-11T04:48:56.358Z',
  },
  {
    type: 'session',
    version: 3,
    id: SAMPLE_SCOUT_SUBAGENT_ID,
    timestamp: '2026-09-11T04:48:56.358Z',
    cwd: '/Users/rajebdev/JatisMobile/bofis-pro',
  },
  {
    type: 'model_change',
    id: 'c1331b8d',
    parentId: null,
    timestamp: '2026-09-11T04:48:56.378Z',
    model: 'deepseek/deepseek-v4-pro',
    resolvedModelIsFallback: false,
  },
  {
    type: 'thinking_level_change',
    id: 'b995bb4e',
    parentId: 'c1331b8d',
    timestamp: '2026-09-11T04:48:56.378Z',
    thinkingLevel: 'low',
    configured: null,
  },
  {
    type: 'session_init',
    id: '221c66d7',
    parentId: 'b995bb4e',
    timestamp: '2026-09-11T04:48:56.379Z',
    systemPrompt:
      'You are a subagent named scout. Answer the user request using the provided tools.',
    task: 'Complete assignment thoroughly:\n\n# Target\nCount .tsx files under src/ of /Users/rajebdev/JatisMobile/bofis-pro (recursive).\n\n# Change\nNone — read-only. Use glob for src/**/*.tsx.\n\n# Acceptance\nReport the integer count and the command/pattern used as evidence. No other commentary.',
    tools: ['read', 'grep', 'glob', 'web_search', 'yield', 'hub'],
    agent: 'scout',
    modelRole: 'smol',
    resolvedModel: 'deepseek/deepseek-v4-pro',
    readOnly: true,
  },
  {
    type: 'message',
    id: '6b0de7ad',
    parentId: '221c66d7',
    timestamp: '2026-09-11T04:48:56.410Z',
    message: {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Complete assignment thoroughly:\n\n# Target\nCount .tsx files under src/ of /Users/rajebdev/JatisMobile/bofis-pro (recursive).\n\n# Change\nNone — read-only. Use glob for src/**/*.tsx.\n\n# Acceptance\nReport the integer count and the command/pattern used as evidence. No other commentary.',
        },
      ],
      attribution: 'agent',
      timestamp: 1789102136380,
    },
  },
  {
    type: 'custom',
    customType: 'tool_execution_start',
    data: {
      toolCallId: 'call_00_Pe7Kp4XZsHxmegoFsmCn8614',
      toolName: 'glob',
      startedAt: '2026-09-11T04:48:59.065Z',
      args: {
        path: 'src/**/*.tsx',
      },
      intent: 'Counting tsx files under src',
    },
    id: '17115c6a',
    parentId: '6b0de7ad',
    timestamp: '2026-09-11T04:48:59.065Z',
  },
  {
    type: 'message',
    id: 'a65c728e',
    parentId: '17115c6a',
    timestamp: '2026-09-11T04:48:59.068Z',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: 'Count .tsx files under src/ recursively using glob.',
          thinkingSignature: 'reasoning_content',
        },
        {
          type: 'toolCall',
          id: 'call_00_Pe7Kp4XZsHxmegoFsmCn8614',
          name: 'glob',
          arguments: {
            i: 'Counting tsx files under src',
            path: 'src/**/*.tsx',
            hidden: true,
            gitignore: true,
            limit: 10000,
          },
          partialArgs:
            '{"i": "Counting tsx files under src", "path": "src/**/*.tsx", "hidden": true, "gitignore": true, "limit": 10000}',
          streamIndex: 0,
          intent: 'Counting tsx files under src',
        },
      ],
      api: 'openai-completions',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      usage: {
        input: 7565,
        output: 131,
        cacheRead: 2688,
        cacheWrite: 0,
        totalTokens: 10384,
        reasoningTokens: 12,
        cost: {
          input: 0.003290775,
          output: 0.00011397,
          cacheRead: 0.000009744,
          cacheWrite: 0,
          total: 0.003414489,
        },
      },
      stopReason: 'toolUse',
      timestamp: 1789102136409,
      duration: 2632.82,
      ttft: 1462.14,
      completedAt: 1789102139063,
    },
  },
  {
    type: 'message',
    id: '598abe88',
    parentId: 'a65c728e',
    timestamp: '2026-09-11T04:48:59.076Z',
    message: {
      role: 'toolResult',
      toolCallId: 'call_00_Pe7Kp4XZsHxmegoFsmCn8614',
      toolName: 'glob',
      content: [
        {
          type: 'text',
          text: '# src/\nApp.tsx\nmain.tsx\n## components/\nLoginModalView.tsx\nSidebar.tsx\nHeader.tsx\nNotificationDrawer.tsx\nKPICard.tsx\nBarChart.tsx\nNeubrutalButton.tsx\nStatusPill.tsx\n### pbpmd/\nPbPmdTable.tsx\nPbPmdHistoryModal.tsx\nPbPmdDetail.tsx\n### crd/\nCrdForm.tsx\nCrdTable.tsx\nCrdDetail.tsx\n### ui/\nToast.tsx\nApiConfigModal.tsx\nPagination.tsx\nRichTextEditor.tsx\nSearchSelect.tsx\nConfirmDialog.tsx\n### autoCrd/\nAutoCrdLogsView.tsx\n### wa/\nWaSettingsView.tsx\n### sync/\nSyncLogsView.tsx',
        },
      ],
      details: {
        scopePath: 'src',
        fileCount: 25,
        files: [
          'src/App.tsx', 'src/components/LoginModalView.tsx', 'src/components/pbpmd/PbPmdTable.tsx',
          'src/components/crd/CrdForm.tsx', 'src/components/ui/Toast.tsx', 'src/components/Sidebar.tsx',
          'src/components/autoCrd/AutoCrdLogsView.tsx', 'src/components/crd/CrdTable.tsx',
          'src/components/crd/CrdDetail.tsx', 'src/components/wa/WaSettingsView.tsx',
          'src/components/ui/ApiConfigModal.tsx', 'src/components/Header.tsx',
          'src/components/sync/SyncLogsView.tsx', 'src/components/pbpmd/PbPmdHistoryModal.tsx',
          'src/components/NotificationDrawer.tsx', 'src/components/pbpmd/PbPmdDetail.tsx',
          'src/components/KPICard.tsx', 'src/components/ui/Pagination.tsx', 'src/components/BarChart.tsx',
          'src/components/ui/RichTextEditor.tsx', 'src/main.tsx', 'src/components/ui/SearchSelect.tsx',
          'src/components/ui/ConfirmDialog.tsx', 'src/components/NeubrutalButton.tsx', 'src/components/StatusPill.tsx',
        ],
        truncated: false,
        cwd: '/Users/rajebdev/JatisMobile/bofis-pro',
      },
      isError: false,
      timestamp: 1789102139075,
    },
  },
  {
    type: 'message',
    id: '5306785c',
    parentId: '598abe88',
    timestamp: '2026-09-11T04:49:02.510Z',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking:
            'Let me count. The output shows a directory tree. Let me count all .tsx files.\n\n1. App.tsx\n2. main.tsx\n3. LoginModalView.tsx\n4. Sidebar.tsx\n5. Header.tsx\n6. NotificationDrawer.tsx\n7. KPICard.tsx\n8. BarChart.tsx\n9. NeubrutalButton.tsx\n10. StatusPill.tsx\n11. PbPmdTable.tsx\n12. PbPmdHistoryModal.tsx\n13. PbPmdDetail.tsx\n14. CrdForm.tsx\n15. CrdTable.tsx\n16. CrdDetail.tsx\n17. Toast.tsx\n18. ApiConfigModal.tsx\n19. Pagination.tsx\n20. RichTextEditor.tsx\n21. SearchSelect.tsx\n22. ConfirmDialog.tsx\n23. AutoCrdLogsView.tsx\n24. WaSettingsView.tsx\n25. SyncLogsView.tsx\n\n25 files.',
          thinkingSignature: 'reasoning_content',
        },
        {
          type: 'text',
          text: '25 — pattern `src/**/*.tsx` via glob (recursive).',
        },
      ],
      api: 'openai-completions',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      usage: {
        input: 331,
        output: 238,
        cacheRead: 10240,
        cacheWrite: 0,
        totalTokens: 10809,
        reasoningTokens: 220,
        cost: {
          input: 0.000143985,
          output: 0.00020706,
          cacheRead: 0.00003712,
          cacheWrite: 0,
          total: 0.000388165,
        },
      },
      stopReason: 'stop',
      timestamp: 1789102139079,
      duration: 3410.95,
      ttft: 1088.54,
      completedAt: 1789102142509,
    },
  },
  {
    type: 'message',
    id: 'a1d30886',
    parentId: '5306785c',
    timestamp: '2026-09-11T04:49:02.528Z',
    message: {
      role: 'developer',
      content: [
        {
          type: 'text',
          text: '<system-reminder>\nLast turn had no tool call → session idle. Reminder 1 of 3.\n\nEvery turn MUST end with a tool call. First applicable:\n1. **Resume work** — assignment incomplete and not recording an incremental section: call next intended tool (edit, write, bash, search, etc.). NEVER treat this reminder as forced stop.\n2. **Yield incremental section** — only if useful: call `yield` with non-empty `type: string[]`; matching sections accumulate; task continues.\n3. **Yield success** — only if genuinely complete: terminal `yield`; omit `type` for single final structured result in `data`; use `type: string` to finalize from last assistant turn when data omitted.\n4. **Yield error** — only for a real, concrete, nameable blocker (missing file, unavailable API, contradictory spec): describe attempts and exact blocker. NEVER fabricate a "forced immediate-yield" or "system reminder required termination" reason; reminder not a blocker.\n\nDefault option 1 unless work done, blocked, or ready for an incremental section.\n\nNEVER end this turn with text only.\n</system-reminder>',
        },
      ],
      attribution: 'agent',
      timestamp: 1789102142523,
      synthetic: true,
    },
  },
  {
    type: 'custom',
    customType: 'tool_execution_start',
    data: {
      toolCallId: 'call_00_ET_ZYmzL9FYZfw8pLKqqFgA6202',
      toolName: 'yield',
      startedAt: '2026-09-11T04:49:05.081Z',
    },
    id: '13d162c9',
    parentId: 'a1d30886',
    timestamp: '2026-09-11T04:49:05.081Z',
  },
  {
    type: 'message',
    id: '23d57a4a',
    parentId: '13d162c9',
    timestamp: '2026-09-11T04:49:05.081Z',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: 'call_00_ET_ZYmzL9FYZfw8pLKqqFgA6202',
          name: 'yield',
          arguments: {
            type: null,
            data: {
              summary: '25 .tsx files under src/ (recursive).',
              files: [],
              architecture: 'Counted via glob pattern `src/**/*.tsx` returning 25 matches.',
              report: '25 — pattern `src/**/*.tsx` via glob (recursive).',
            },
            error: null,
          },
          partialArgs:
            '{"type": null, "data": {"summary": "25 .tsx files under src/ (recursive).", "files": [], "architecture": "Counted via glob pattern `src/**/*.tsx` returning 25 matches.", "report": "25 — pattern `src/**/*.tsx` via glob (recursive)."}, "error": null}',
          streamIndex: 0,
        },
      ],
      api: 'openai-completions',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      usage: {
        input: 309,
        output: 140,
        cacheRead: 10752,
        cacheWrite: 0,
        totalTokens: 11201,
        cost: {
          input: 0.000134415,
          output: 0.0001218,
          cacheRead: 0.000038976,
          cacheWrite: 0,
          total: 0.000295191,
        },
      },
      stopReason: 'toolUse',
      timestamp: 1789102142527,
      duration: 2553.15,
      completedAt: 1789102145080,
    },
  },
  {
    type: 'message',
    id: '73a1b674',
    parentId: '23d57a4a',
    timestamp: '2026-09-11T04:49:05.082Z',
    message: {
      role: 'toolResult',
      toolCallId: 'call_00_ET_ZYmzL9FYZfw8pLKqqFgA6202',
      toolName: 'yield',
      content: [
        {
          type: 'text',
          text: 'Result submitted.',
        },
      ],
      details: {
        data: {
          summary: '25 .tsx files under src/ (recursive).',
          files: [],
          architecture: 'Counted via glob pattern `src/**/*.tsx` returning 25 matches.',
          report: '25 — pattern `src/**/*.tsx` via glob (recursive).',
        },
        status: 'success',
      },
      isError: false,
      timestamp: 1789102145081,
    },
  },
  {
    type: 'custom',
    customType: 'session_exit',
    data: {
      reason: 'dispose',
      kind: 'normal',
      recordedAt: '2026-09-11T04:56:05.086Z',
    },
    id: 'a786d4bd',
    parentId: '73a1b674',
    timestamp: '2026-09-11T04:56:05.086Z',
  },
];
