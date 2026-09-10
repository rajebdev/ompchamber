import { getDb } from '@/db.server';
import { GoogleGenAI } from '@google/genai';
import type { ToolCallData, ChatMessageData } from '@/types';

// Helper to delay execution for realistic stream simulation
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface StreamSendEvent {
  (event: string, data: any): void;
}

// Persists the completed AI message to SQLite
async function persistAiMessage(sessionId: string, aiMessage: ChatMessageData) {
  try {
    const db = await getDb();
    const existing = await db.get('SELECT * FROM chat_sessions WHERE session_id = ?', [sessionId]);
    let currentMessages: any[] = [];
    let title = existing?.title || `Session ${sessionId}`;

    if (existing?.messages) {
      try {
        currentMessages = JSON.parse(existing.messages);
      } catch {
        currentMessages = [];
      }
    }

    const nextMessages = [...currentMessages, aiMessage];
    await db.run(
      'INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [sessionId, title, JSON.stringify(nextMessages)]
    );
  } catch (err) {
    console.error('Failed to persist streamed message:', err);
  }
}

// Handler for real Gemini API streaming
export async function handleGeminiStreaming(options: {
  apiKey: string;
  prompt: string;
  modelName: string;
  sessionId: string;
  messageId: string;
  timeStr: string;
  sendEvent: StreamSendEvent;
  isAborted: () => boolean;
}) {
  const { apiKey, prompt, sessionId, messageId, timeStr, sendEvent, isAborted } = options;
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  sendEvent('thinking_start', { title: 'Deep Reasoning' });
  const thoughtText = `Deconstructing prompt: "${prompt}".\nAnalyzing project context, evaluating edge dependencies, and generating validated response.`;
  
  // Stream thinking chunk
  sendEvent('thinking_chunk', { delta: thoughtText });
  sendEvent('thinking_end', {
    thought: thoughtText,
    summary: 'Analyze context and stream response',
    duration: '0.8s',
  });

  sendEvent('content_start', {});

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-3.8-flash',
    contents: prompt || 'Hello',
    config: {
      systemInstruction: 'You are OMPChamber AI Assistant, integrated with Oh-My-Pi, remisJS, and Bun runtime environments. Provide concise, clean, markdown-formatted responses.',
    },
  });

  let fullContent = '';
  for await (const chunk of responseStream) {
    if (isAborted()) break;
    const textChunk = chunk.text || '';
    if (textChunk) {
      fullContent += textChunk;
      sendEvent('content_chunk', { delta: textChunk });
    }
  }

  sendEvent('content_end', {});

  const summary = 'Generation completed successfully via Gemini API.';
  sendEvent('summary', { summary });

  const finalMessage: ChatMessageData = {
    id: messageId,
    role: 'ai',
    date: `Today, ${timeStr}`,
    timestamp: timeStr,
    thinking: {
      duration: '0.8s',
      thought: thoughtText,
      summary: 'Analyze context and stream response',
    },
    content: fullContent,
    summary,
  };

  sendEvent('done', { message: finalMessage });
  await persistAiMessage(sessionId, finalMessage);
}

// Handler for domain-aware simulated streaming with tool executions & chunked tokens
export async function handleSimulatedStreaming(options: {
  prompt: string;
  modelName: string;
  workspaceName: string;
  sessionId: string;
  messageId: string;
  timeStr: string;
  sendEvent: StreamSendEvent;
  isAborted: () => boolean;
}) {
  const { prompt, workspaceName, sessionId, messageId, timeStr, sendEvent, isAborted } = options;

  // 1. Thinking Phase - Calm and steady pacing
  sendEvent('thinking_start', { title: 'Thinking' });
  await delay(300);
  if (isAborted()) return;

  const thinkingSteps = [
    `1. Deconstruct user prompt: "${prompt || 'Diagnostic check'}".\n`,
    `2. Target context: ${workspaceName} with Bun v1.2.4 runtime.\n`,
    `3. Inspecting active edge routes, module boundaries, and build dependencies.\n`,
    `4. Executing workspace verification and synthesizing patch.\n`,
  ];

  let accumulatedThought = '';
  for (const step of thinkingSteps) {
    if (isAborted()) return;
    accumulatedThought += step;
    sendEvent('thinking_chunk', { delta: step });
    await delay(350);
  }

  sendEvent('thinking_end', {
    thought: accumulatedThought.trim(),
    summary: 'Deconstruct prompt, execute workspace diagnostics, and formulate implementation patch.',
    duration: '1.4s',
  });

  await delay(300);
  if (isAborted()) return;

  // 2. Tool Execution Phase
  const readToolId = `tc-${Date.now()}-read`;
  const readTool: ToolCallData = {
    id: readToolId,
    type: 'read_file',
    title: 'Read File',
    target: 'examples/index.js',
    command: 'read_file examples/index.js',
    status: 'running',
  };

  sendEvent('tool_start', readTool);
  await delay(450);
  if (isAborted()) return;

  const readOutput = `// examples/index.js\nimport { createServer } from 'http';\n\nconst port = process.env.PORT || 3000;\nconst server = createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ status: 'healthy', runtime: 'bun' }));\n});\n\nserver.listen(port, () => {\n  console.log(\`Server running at http://localhost:\${port}/\`);\n});`;
  
  sendEvent('tool_output_chunk', { id: readToolId, delta: readOutput });
  sendEvent('tool_end', {
    id: readToolId,
    status: 'success',
    duration: '18ms',
    output: readOutput,
  });

  await delay(350);
  if (isAborted()) return;

  const bashToolId = `tc-${Date.now()}-bash`;
  const bashTool: ToolCallData = {
    id: bashToolId,
    type: 'bash',
    title: 'Diagnostic Command',
    target: 'bun --version && bun pm ls',
    command: 'bun --version && bun pm ls',
    status: 'running',
  };

  sendEvent('tool_start', bashTool);
  await delay(500);
  if (isAborted()) return;

  const bashOutput = 'Bun v1.2.4\n├── @remis/edge@1.0.4\n├── lucide-react@0.546.0\n└── tailwindcss@4.1.14';
  sendEvent('tool_output_chunk', { id: bashToolId, delta: bashOutput });
  sendEvent('tool_end', {
    id: bashToolId,
    status: 'success',
    duration: '85ms',
    output: bashOutput,
  });

  await delay(400);
  if (isAborted()) return;

  // 3. Content Streaming Phase - Smooth and natural word-by-word streaming
  sendEvent('content_start', {});

  const promptSnippet = prompt.length > 50 ? `${prompt.slice(0, 50)}...` : prompt;
  const contentParagraphs = [
    `I've processed your request: **"${promptSnippet || 'Workspace diagnostic'}"**.\n\n`,
    `### Diagnostics & Environment Status\n`,
    `- **Workspace Target**: \`${workspaceName}\`\n`,
    `- **Runtime Target**: Bun v1.2.4 with native TypeScript striping\n`,
    `- **Edge Adapter**: remisJS edge routes & build plugins\n`,
    `- **Module Integrity**: All 14 workspace modules validated with 0 errors\n\n`,
    `The runtime environment is healthy and all diagnostics passed successfully. You can inspect the detailed telemetry matrix or execute further chamber commands directly.`,
  ];

  let fullContent = '';
  for (const para of contentParagraphs) {
    if (isAborted()) return;
    // Break into small token chunks for natural streaming cadence
    const words = para.split(' ');
    for (let i = 0; i < words.length; i++) {
      if (isAborted()) return;
      const chunk = (i === 0 ? '' : ' ') + words[i];
      fullContent += chunk;
      sendEvent('content_chunk', { delta: chunk });
      await delay(50);
    }
  }

  sendEvent('content_end', {});

  // 4. Summary Event
  const summaryText = 'Execution completed in 1.8s with 0 errors.';
  sendEvent('summary', { summary: summaryText });

  const finalMessage: ChatMessageData = {
    id: messageId,
    role: 'ai',
    date: `Today, ${timeStr}`,
    timestamp: timeStr,
    thinking: {
      duration: '1.4s',
      thought: accumulatedThought.trim(),
      summary: 'Deconstruct prompt, execute workspace diagnostics, and formulate implementation patch.',
    },
    toolCalls: [
      {
        ...readTool,
        status: 'success',
        duration: '18ms',
        output: readOutput,
      },
      {
        ...bashTool,
        status: 'success',
        duration: '85ms',
        output: bashOutput,
      },
    ],
    content: fullContent,
    summary: summaryText,
  };

  sendEvent('done', { message: finalMessage });
  await persistAiMessage(sessionId, finalMessage);
}
