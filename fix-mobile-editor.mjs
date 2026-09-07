import fs from 'fs';
let code = fs.readFileSync('app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx', 'utf8');

if (!code.includes('FileIcon')) {
  code = code.replace(/import \{\s*ArrowLeft,/, `import { FileIcon } from '../../common/FileIcon';\nimport {\n  ArrowLeft,`);
}

code = code.replace(/\{isMd \? <FileText size=\{15\} className="text-ink\/70 flex-shrink-0" \/> : <FileCode size=\{15\} className="text-ink\/70 flex-shrink-0" \/>\}/, `<FileIcon name={file.name} size={15} className="flex-shrink-0" />`);

// Remove const isMd if unused
code = code.replace(/const isMd = [^;]+;/, '');

fs.writeFileSync('app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx', code);
