import fs from 'fs';

let mobileCode = fs.readFileSync('app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx', 'utf8');

// Add WrapText to lucide-react imports
mobileCode = mobileCode.replace(
  /EyeOff, \n  X,/,
  'EyeOff, \n  X,\n  WrapText,'
);

// Add wordWrap state
mobileCode = mobileCode.replace(
  /const \[fontSize, setFontSize\] = useState\(13\);/,
  "const [fontSize, setFontSize] = useState(13);\n  const [wordWrap, setWordWrap] = useState(true);"
);

// Add WrapText button
const zoomControlsRegex = /\{\/\* Zoom controls \*\/\}/;
mobileCode = mobileCode.replace(
  zoomControlsRegex,
  `{/* Wrap toggle */}
          <button
            type="button"
            onClick={() => setWordWrap(!wordWrap)}
            className={\`p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer \${wordWrap ? 'text-ink' : ''}\`}
            title="Toggle word wrap"
          >
            <WrapText size={15} />
          </button>
          
          {/* Zoom controls */}`
);

// Update CodeEditor textareaClassName
mobileCode = mobileCode.replace(
  /padding=\{0\}/,
  `padding={0}\n                textareaClassName={\`focus:outline-none \${wordWrap ? '!whitespace-pre-wrap !break-words' : '!whitespace-pre !break-normal'}\`}\n                preClassName={\`\${wordWrap ? '!whitespace-pre-wrap !break-words' : '!whitespace-pre !break-normal'}\`}`
);

fs.writeFileSync('app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx', mobileCode);
