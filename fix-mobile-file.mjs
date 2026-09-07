import fs from 'fs';
let code = fs.readFileSync('app/components/mobile/mobile-right-sidebar/MobileGitFileItem.tsx', 'utf8');
code = code.replace(/import \{ Undo2, Plus, Minus, FileCode, FileText \} from 'lucide-react';/, `import { Undo2, Plus, Minus } from 'lucide-react';
import { FileIcon } from '../../../common/FileIcon';`);

code = code.replace(/\{isMd \? \([\s\S]*?<FileText size=\{13\} className="text-ink\/50 flex-shrink-0" \/>[\s\S]*?\) : \([\s\S]*?<FileCode size=\{13\} className="text-ink\/50 flex-shrink-0" \/>[\s\S]*?\)\}/, `<FileIcon name={fileName} size={13} className="flex-shrink-0" />`);

code = code.replace(/const isMd = [^;]+;/, '');

fs.writeFileSync('app/components/mobile/mobile-right-sidebar/MobileGitFileItem.tsx', code);
