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
  toolCalls?: ToolCallData[];
  actions?: (AgentActionData | ToolCallData)[];
  systemNote?: string;
  actions2?: (AgentActionData | ToolCallData)[];
  summary?: string;
  monologue?: string;
}

export interface AIModelOption {
  id: string;
  name: string;
  provider: string;
}

