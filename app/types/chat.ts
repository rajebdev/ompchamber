import React from 'react';

export interface Attachment {
  id: string;
  name?: string;
  file: File;
  preview: string;
  type?: string;
  size?: number;
}

export type ChatAttachment = Attachment;

export type ToolType = 
  | 'bash' 
  | 'terminal' 
  | 'edit_file' 
  | 'read_file' 
  | 'view_file'
  | 'create_file' 
  | 'search_fs' 
  | 'web_search' 
  | 'custom';

export type ToolStatus = 'success' | 'running' | 'error' | 'pending';

export interface ToolDiffChunk {
  file: string;
  added?: number;
  removed?: number;
  diffText?: string;
}

export interface ToolCallData {
  id: string;
  type: ToolType;
  title: string;
  name?: string;
  target?: string;
  command?: string;
  input?: string | Record<string, any>;
  output?: string;
  error?: string;
  status?: ToolStatus;
  duration?: string;
  diff?: ToolDiffChunk;
  icon?: React.ReactNode;
  detail?: string;
  time?: string;
}

export interface ThinkingData {
  duration?: string;
  thought: string;
  summary?: string;
  steps?: string[];
  isGenerating?: boolean;
}

export interface AgentActionData {
  icon?: React.ReactNode;
  title: string;
  time?: string;
  detail: string;
  type?: ToolType;
  command?: string;
  output?: string;
  status?: ToolStatus;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'ai' | 'assistant';
  date?: string;
  timestamp?: string;
  content: string;
  attachments?: { id?: string; name: string; preview?: string; type?: string; size?: number }[];
  thinking?: ThinkingData | string;
  /** Short human intent for tool calls (omp arguments.i) shown before the tools. */
  intent?: string;
  toolCalls?: ToolCallData[];
  actions?: (AgentActionData | ToolCallData)[];
  systemNote?: string;
  actions2?: (AgentActionData | ToolCallData)[];
  summary?: string;
  monologue?: string;
  /** Provider/API error attached to an assistant turn (e.g. 401 auth failure). */
  error?: {
    status?: number;
    id?: number;
    message?: string;
    stopReason?: string;
  };
}

export interface AIModelOption {
  id: string;
  name: string;
  provider: string;
  providerIcon?: string;
  contextWindow?: string;
  isCmdAgent?: boolean;
  isFavorite?: boolean;
  isRecent?: boolean;
  thinkingLevel?: 'Default' | 'High' | 'Low' | 'Off';
  capabilities?: string[];
  input?: string;
  output?: string;
  cost?: {
    input: string;
    output: string;
  };
  description?: string;
}

