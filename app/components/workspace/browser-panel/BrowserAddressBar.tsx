import { useState } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Home, 
  Globe, 
  ExternalLink, 
  Copy, 
  Check, 
  X, 
  Monitor, 
  Tablet, 
  Smartphone 
} from 'lucide-react';

interface BrowserAddressBarProps {
  inputUrl: string;
  committedUrl: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewportMode: 'responsive' | 'tablet' | 'mobile';
  onChangeInput: (url: string) => void;
  onSubmitUrl: (e?: React.FormEvent) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onOpenExternal: () => void;
  onChangeViewport: (mode: 'responsive' | 'tablet' | 'mobile') => void;
}

export function BrowserAddressBar({
  inputUrl,
  committedUrl,
  isLoading,
  canGoBack,
  canGoForward,
  viewportMode,
  onChangeInput,
  onSubmitUrl,
  onGoBack,
  onGoForward,
  onReload,
  onHome,
  onOpenExternal,
  onChangeViewport,
}: BrowserAddressBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = committedUrl || inputUrl;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleClear = () => {
    onChangeInput('');
  };

  return (
    <div className="h-10 px-2.5 border-b border-ink/10 bg-paper flex items-center justify-between flex-shrink-0 select-none space-x-2">
      {/* Navigation Buttons: Back, Forward, Reload, Home */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        <button
          type="button"
          onClick={onGoBack}
          disabled={!canGoBack}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>

        <button
          type="button"
          onClick={onGoForward}
          disabled={!canGoForward}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title="Forward"
        >
          <ArrowRight size={14} />
        </button>

        <button
          type="button"
          onClick={onReload}
          className="p-1.5 rounded hover:bg-ink/5 text-ink/70 hover:text-ink transition-colors cursor-pointer"
          title="Reload page"
        >
          <RotateCw size={14} className={isLoading ? 'animate-spin text-ink' : ''} />
        </button>

        <button
          type="button"
          onClick={onHome}
          className="p-1.5 rounded hover:bg-ink/5 text-ink/70 hover:text-ink transition-colors cursor-pointer"
          title="Home (/)"
        >
          <Home size={14} />
        </button>
      </div>

      {/* Address Bar Form */}
      <form onSubmit={onSubmitUrl} className="flex-1 min-w-0 flex items-center">
        <div className="w-full flex items-center bg-canvas border border-ink/15 hover:border-ink/30 focus-within:border-ink/50 focus-within:ring-1 focus-within:ring-ink/20 rounded-md px-2 py-0.5 transition-all text-xs">
          <Globe size={12} className="text-ink/40 mr-1.5 flex-shrink-0" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => onChangeInput(e.target.value)}
            placeholder="Enter URL or path (e.g. / or http://localhost:3000)..."
            className="w-full bg-transparent text-ink font-mono text-[11px] placeholder:text-ink/30 focus:outline-none"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
          {inputUrl && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-ink/40 hover:text-ink ml-1 rounded flex-shrink-0"
              title="Clear"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </form>

      {/* Viewport Presets & Action Buttons */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        {/* Viewport Mode Toggles */}
        <div className="hidden sm:flex items-center bg-canvas border border-ink/10 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => onChangeViewport('responsive')}
            className={`p-1 rounded text-xs transition-colors ${viewportMode === 'responsive' ? 'bg-ink text-canvas font-medium' : 'text-ink/50 hover:text-ink'}`}
            title="Responsive (100%)"
          >
            <Monitor size={12} />
          </button>
          <button
            type="button"
            onClick={() => onChangeViewport('tablet')}
            className={`p-1 rounded text-xs transition-colors ${viewportMode === 'tablet' ? 'bg-ink text-canvas font-medium' : 'text-ink/50 hover:text-ink'}`}
            title="Tablet (768px)"
          >
            <Tablet size={12} />
          </button>
          <button
            type="button"
            onClick={() => onChangeViewport('mobile')}
            className={`p-1 rounded text-xs transition-colors ${viewportMode === 'mobile' ? 'bg-ink text-canvas font-medium' : 'text-ink/50 hover:text-ink'}`}
            title="Mobile (375px)"
          >
            <Smartphone size={12} />
          </button>
        </div>

        {/* Copy URL */}
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded hover:bg-ink/5 text-ink/70 hover:text-ink transition-colors cursor-pointer"
          title={copied ? "Copied URL!" : "Copy URL"}
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>

        {/* Open in external tab */}
        <button
          type="button"
          onClick={onOpenExternal}
          className="p-1.5 rounded hover:bg-ink/5 text-ink/70 hover:text-ink transition-colors cursor-pointer"
          title="Open in new window"
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}
