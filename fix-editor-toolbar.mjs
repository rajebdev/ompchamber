import fs from 'fs';

let desktopCode = fs.readFileSync('app/components/workspace/Editor.tsx', 'utf8');

// 1. Add WrapText to lucide-react imports
desktopCode = desktopCode.replace(
  /Copy, Download, ZoomIn, ZoomOut, Maximize, ExternalLink, X, Eye, EyeOff, Save, Check, ChevronDown/,
  'Copy, Download, ZoomIn, ZoomOut, Maximize, ExternalLink, X, Eye, EyeOff, Save, Check, ChevronDown, WrapText'
);

// 2. Add wordWrap state
desktopCode = desktopCode.replace(
  /const \[saveStatus, setSaveStatus\] = useState\<'idle' \| 'saving' \| 'saved'\>\('idle'\);/,
  "const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');\n  const [wordWrap, setWordWrap] = useState(true);"
);

// 3. Replace the toolbar block
const oldToolbarRegex = /<div className="flex items-center justify-between px-3 py-2 border-b border-ink\/10 bg-paper">[\s\S]*?\{\/\* Editor Content \*\/\}/;
const newToolbar = `<div className="flex items-center justify-between px-3 py-2 border-b border-ink/10 bg-paper">
            {/* Left status */}
            <div className="flex items-center space-x-2 text-xs font-mono text-ink/40">
              <span className="truncate max-w-[300px]" title={activeFile.path}>{activeFile.path}</span>
            </div>

            {/* Right actions */}
            <div className="flex items-center space-x-3 text-ink/40">
              <div className="flex items-center pr-3 border-r border-ink/10">
                <button
                  type="button"
                  onClick={() => saveFileToDisk(activeFile, currentContent)}
                  className="flex items-center justify-center rounded hover:bg-ink/5 transition-colors"
                  title="Save file (Ctrl+S)"
                >
                  {saveStatus === 'saving' ? (
                    <Save size={14} className="text-amber-500 animate-pulse" />
                  ) : saveStatus === 'saved' ? (
                    <Check size={14} className="text-success" />
                  ) : (
                    <Save size={14} className="hover:text-ink cursor-pointer" />
                  )}
                </button>
              </div>

              {isMd && (
                <div onClick={togglePreview} className="flex items-center pr-3 border-r border-ink/10">
                  {isPreview ? (
                    <EyeOff size={14} className="hover:text-ink cursor-pointer" />
                  ) : (
                    <Eye size={14} className="hover:text-ink cursor-pointer" />
                  )}
                </div>
              )}
              
              <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
                <WrapText size={14} className={\`cursor-pointer \${wordWrap ? 'text-ink' : 'hover:text-ink'}\`} onClick={() => setWordWrap(!wordWrap)} title="Toggle Word Wrap" />
              </div>

              <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
                <ZoomOut size={14} className="hover:text-ink cursor-pointer" onClick={() => setZoomLevel(z => Math.max(8, z - 1))} title="Zoom Out" />
                <ZoomIn size={14} className="hover:text-ink cursor-pointer" onClick={() => setZoomLevel(z => Math.min(24, z + 1))} title="Zoom In" />
              </div>
              
              <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
                <Copy size={14} className="hover:text-ink cursor-pointer" onClick={handleCopy} title="Copy" />
                <Download size={14} className="hover:text-ink cursor-pointer" onClick={handleDownload} title="Download" />
              </div>

              <div className="flex items-center pl-1">
                <Maximize size={14} className="hover:text-ink cursor-pointer" onClick={() => setIsMaximized(!isMaximized)} title="Maximize" />
              </div>
            </div>
          </div>
          
          {/* Editor Content */}`;

desktopCode = desktopCode.replace(oldToolbarRegex, newToolbar);

// 4. Update the CodeEditor classNames based on wordWrap
desktopCode = desktopCode.replace(
  /textareaClassName="focus:outline-none !whitespace-pre !break-normal"/g,
  `textareaClassName={\`focus:outline-none \${wordWrap ? '!whitespace-pre-wrap !break-words' : '!whitespace-pre !break-normal'}\`}`
);
desktopCode = desktopCode.replace(
  /preClassName="!whitespace-pre !break-normal"/g,
  `preClassName={\`\${wordWrap ? '!whitespace-pre-wrap !break-words' : '!whitespace-pre !break-normal'}\`}`
);

fs.writeFileSync('app/components/workspace/Editor.tsx', desktopCode);
