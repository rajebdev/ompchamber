import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ChatInput } from './ChatInput';

interface NewChatModalProps {
  initialContent: string;
  onClose: () => void;
  onSend: (text: string, attachments: any[]) => void;
  appSettings?: Record<string, any>;
}

export function NewChatModal({ initialContent, onClose, onSend, appSettings }: NewChatModalProps) {
  const [inputValue, setInputValue] = useState(initialContent);
  const [attachments, setAttachments] = useState<any[]>([]);

  const handleSend = (atts: any[]) => {
    onSend(inputValue, atts);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141310]/40 animate-in fade-in duration-200 p-4">
      <div 
        className="bg-[#f4f1ea] border border-[#141310]/15 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#141310]/10 bg-[#faf8f3]">
          <h2 className="text-[13px] font-semibold text-[#141310]">New Chat</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded hover:bg-[#141310]/10 text-[#141310]/60 hover:text-[#141310] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <p className="text-xs text-[#141310]/60 mb-3">
            Start a new session in this workspace based on the selected message.
          </p>
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onSend={handleSend}
            isGenerating={false}
            appSettings={appSettings}
          />
        </div>
      </div>
    </div>
  );
}
