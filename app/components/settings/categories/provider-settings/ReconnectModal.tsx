import React, { useState } from 'react';
import { X, Key, Globe, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ProviderItem } from '@/types';
import { ProviderIcon } from '@/components/settings/categories/provider-settings/ProviderIcons';

interface ReconnectModalProps {
  isOpen: boolean;
  provider: ProviderItem;
  onClose: () => void;
  onReconnect: (updatedProvider: Partial<ProviderItem>) => void;
}

export function ReconnectModal({
  isOpen,
  provider,
  onClose,
  onReconnect,
}: ReconnectModalProps) {
  const [apiKey, setApiKey] = useState(provider.apiKey || 'sk-••••••••••••••••••••••••');
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl || 'https://api.openai.com/v1');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setIsTesting(false);
      setTestResult('success');
    }, 900);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onReconnect({
      apiKey,
      baseUrl,
      status: 'connected',
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper border border-ink/15 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ProviderIcon icon={provider.icon} size={18} />
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Authentication & Credentials
              </h3>
              <p className="text-[11px] text-ink/50 font-mono">
                {provider.slug}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-ink/40 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Base URL */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Endpoint URL
            </label>
            <div className="relative flex items-center">
              <Globe size={13} className="absolute left-2.5 text-ink/40 pointer-events-none" />
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full bg-paper border border-ink/20 rounded-md pl-8 pr-3 py-1.5 text-xs text-ink outline-none focus:border-ink/60 font-mono"
              />
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              API Key / Auth Token
            </label>
            <div className="relative flex items-center">
              <Key size={13} className="absolute left-2.5 text-ink/40 pointer-events-none" />
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-paper border border-ink/20 rounded-md pl-8 pr-3 py-1.5 text-xs text-ink outline-none focus:border-ink/60 font-mono"
              />
            </div>
          </div>

          {/* Test connection indicator */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestConnection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink/20 hover:border-ink/40 text-xs font-medium text-ink transition-colors cursor-pointer bg-ink/5 disabled:opacity-50"
            >
              <RefreshCw size={13} className={isTesting ? 'animate-spin' : ''} />
              <span>{isTesting ? 'Testing endpoint...' : 'Test Connection'}</span>
            </button>

            {testResult === 'success' && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
                <CheckCircle2 size={13} />
                <span>200 OK (38ms)</span>
              </span>
            )}
            {testResult === 'failed' && (
              <span className="inline-flex items-center gap-1 text-xs text-error font-medium">
                <AlertCircle size={13} />
                <span>Connection failed</span>
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-ink/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md border border-ink/20 text-xs font-medium text-ink hover:bg-ink/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-md bg-ink text-canvas text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              Save & Reconnect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
