import fs from 'fs';
let code = fs.readFileSync('app/components/workspace/Editor.tsx', 'utf8');

if (!code.includes('FileIcon')) {
  code = code.replace(/import \{\s*FileText,/, `import { FileIcon } from '../common/FileIcon';\nimport {\n  FileText,`);
}

code = code.replace(/<FileText size=\{14\} className=\{isActive \? 'text-ink' : 'text-ink\/60'\} \/>/, `<FileIcon name={file.name} size={14} className={isActive ? '' : 'opacity-60'} />`);
code = code.replace(/<FileText size=\{14\} className="text-ink\/60" \/>/g, `<FileIcon name={file.name} size={14} className="opacity-60" />`);

fs.writeFileSync('app/components/workspace/Editor.tsx', code);
