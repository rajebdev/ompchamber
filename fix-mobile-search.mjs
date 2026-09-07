import fs from 'fs';
let code = fs.readFileSync('app/components/mobile/mobile-right-sidebar/MobileSearchTab.tsx', 'utf8');

if (!code.includes('FileIcon')) {
  code = code.replace(/import \{\s*Search,\s*CaseSensitive,/m, `import { FileIcon } from '../../common/FileIcon';\nimport {\n  Search,\n  CaseSensitive,`);
}

code = code.replace(/<span className="truncate">\{file\}<\/span>/, `<FileIcon name={file} size={12} className="mr-1.5 flex-shrink-0" />
                      <span className="truncate">{file}</span>`);

fs.writeFileSync('app/components/mobile/mobile-right-sidebar/MobileSearchTab.tsx', code);
