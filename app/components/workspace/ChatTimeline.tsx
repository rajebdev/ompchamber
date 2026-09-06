import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { MoreHorizontal, ArrowDown, Lightbulb } from 'lucide-react';
import { useSearchParams } from '@remix-run/react';
import type { Attachment } from '@/types';
import { ChatInput } from './chat-timeline/ChatInput';
import { ChatMessageItem } from './chat-timeline/ChatMessageItem';
import { MinimapShortcuts } from './chat-timeline/MinimapShortcuts';
import { EmptyWorkspacePrompt } from './chat-timeline/EmptyWorkspacePrompt';
import { GeneratingIndicator } from './chat-timeline/GeneratingIndicator';
import { getSessionData } from '@/data/chatMockData';

export function ChatTimeline({ className = '', folders = [] }: { className?: string, folders?: any[] }) {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const folderId = searchParams.get('folderId');

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);

  useEffect(() => {
    if (folderId) {
      setSelectedFolderId(parseInt(folderId, 10));
    } else {
      setSelectedFolderId(null);
    }
  }, [folderId]);

  // Scroll to bottom logic
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollBottom(!isNearBottom);
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  };

  const [inputValue, setInputValue] = useState('');
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingVerb, setGeneratingVerb] = useState('');

  // Extended dummy logic for multiple turns
  const sessionData = useMemo(() => {
    return getSessionData(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (sessionData) {
      setLocalMessages(sessionData.messages);
    } else {
      setLocalMessages([]);
    }
  }, [sessionData]);

  // Auto-scroll to bottom instantly when session changes
  useEffect(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToBottom('instant' as ScrollBehavior);
        setShowScrollBottom(false);
      }, 0);
    });
  }, [sessionId, localMessages.length]);

  const handleSend = (attachments: Attachment[]) => {
    if (!inputValue.trim() && attachments.length === 0 || isGenerating) return;

    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const newUserMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      date: `Today, ${time}`,
      content: inputValue.trim(),
      attachments: attachments.map(a => ({ name: a.file.name, preview: a.preview }))
    };

    setLocalMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    setIsGenerating(true);
    
    const verbs = [
      'Synthesizing solution',
      'Deep reasoning',
      'Architecting patch',
      'Deconstructing AST',
      'Compiling edge routes',
      'Analyzing runtime context',
      'Optimizing code structure'
    ];
    setGeneratingVerb(verbs[Math.floor(Math.random() * verbs.length)]);
    
    setTimeout(() => scrollToBottom('smooth'), 50);

    // Simulate realistic multi-step AI reasoning and tool calls
    setTimeout(() => {
      const newAiMsg = {
        id: `msg-${Date.now()}-ai`,
        role: 'ai',
        date: `Today, ${time}`,
        thinking: {
          duration: "2.1s",
          summary: "Deconstruct prompt, execute workspace diagnostics, and formulate implementation patch.",
          thought: `1. User requested: "${inputValue.trim()}".\n2. Inspecting project context and Bun runtime dependencies.\n3. Running diagnostic checks against active edge endpoints.\n4. Compiling resolution output.`
        },
        toolCalls: [
          {
            id: `tc-${Date.now()}-read`,
            type: 'read_file' as const,
            title: 'Read File',
            target: 'examples/index.js',
            command: 'read_file examples/index.js',
            output: `// examples/index.js\nimport { createServer } from 'http';\n\nconst port = process.env.PORT || 3000;\nconst server = createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ status: 'healthy', runtime: 'bun' }));\n});\n\nserver.listen(port, () => {\n  console.log(\`Server running at http://localhost:\${port}/\`);\n});`,
            status: 'success' as const,
            duration: '18ms'
          },
          {
            id: `tc-${Date.now()}-1`,
            type: 'bash' as const,
            title: 'Diagnostic Command',
            target: 'bun --version && bun pm ls',
            command: 'bun --version && bun pm ls',
            output: 'Bun v1.2.4\n├── @remis/edge@1.0.4\n├── lucide-react@0.475.0\n└── tailwindcss@4.0.0',
            status: 'success' as const,
            duration: '85ms'
          },
          {
            id: `tc-${Date.now()}-2`,
            type: 'edit_file' as const,
            title: 'Workspace Patch',
            target: 'app/components/workspace/ChatTimeline.tsx',
            command: 'edit_file app/components/workspace/ChatTimeline.tsx',
            diff: {
              file: 'app/components/workspace/ChatTimeline.tsx',
              added: 8,
              removed: 2,
              diffText: `@@ -85,2 +85,8 @@\n+  // Verified runtime compatibility with bun v1.2.4\n+  const isReady = true;`
            },
            output: 'Successfully applied updates.',
            status: 'success' as const,
            duration: '140ms'
          }
        ],
        content: `I've processed your request: "${inputValue.trim()}". The runtime environment is healthy and all diagnostics passed successfully.`,
        summary: "Execution completed in 2.3s with 0 errors."
      };
      setLocalMessages(prev => [...prev, newAiMsg]);
      setIsGenerating(false);
      setTimeout(() => scrollToBottom('smooth'), 50);
    }, 2500);
  };

  const userMessages = localMessages.filter(m => m.role === 'user');

  const handleUndo = (msgId: string, content?: string) => {
    if (content) {
      setInputValue(content);
    }
    setLocalMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const handleScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (!sessionId) {
    return (
      <EmptyWorkspacePrompt
        className={className}
        folders={folders}
        selectedFolderId={selectedFolderId}
        setSelectedFolderId={setSelectedFolderId}
        inputValue={inputValue}
        setInputValue={setInputValue}
        onSend={handleSend}
        isGenerating={isGenerating}
      />
    );
  }

  return (
    <div className={`flex flex-col h-full bg-[#f4f1ea] relative ${className}`}>
      {/* Timeline Header */}
      <div className="flex-shrink-0 h-12 flex items-center justify-between px-4 bg-[#faf8f3] border-b border-[#141310]/10 z-10">
        <div className="flex flex-col justify-center">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold text-xs text-[#141310]">{sessionData?.title}</h3>
            <MoreHorizontal size={14} className="text-[#141310]/40 hover:text-[#141310] cursor-pointer" />
          </div>
          <div className="text-[10px] font-mono text-[#141310]/60 leading-none mt-0.5">
            Workspace <span className="mx-1">⎇</span> main
          </div>
        </div>
      </div>

      {/* Minimap Shortcuts */}
      <MinimapShortcuts 
        userMessages={userMessages} 
        onScrollTo={handleScrollTo} 
      />

      {/* Main chat container wrapper */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Timeline Body */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-8 scroll-smooth overflow-x-hidden"
        >
          {localMessages.map((msg) => (
            <ChatMessageItem 
              key={msg.id} 
              msg={msg} 
              modelName={sessionData?.model} 
              onUndo={handleUndo}
            />
          ))}

          {isGenerating && (
            <GeneratingIndicator 
              modelName={sessionData?.model} 
              generatingVerb={generatingVerb} 
            />
          )}
        </div>

        {/* Scroll to bottom button */}
        {showScrollBottom && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
            <button 
              onClick={() => scrollToBottom('smooth')}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-[#141310]/20 bg-[#faf8f3] text-[#141310]/60 hover:text-[#141310] hover:bg-[#141310]/5 transition-all shadow-sm"
              title="Scroll to bottom"
            >
              <ArrowDown size={16} />
            </button>
          </div>
        )}
      </div>
      
      {/* Input Area Footer */}
      <div className="p-4 bg-[#f4f1ea] border-t border-[#141310]/10 flex-shrink-0">
        <ChatInput 
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
}
