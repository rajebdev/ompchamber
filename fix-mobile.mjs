import fs from 'fs';
let code = fs.readFileSync('app/components/mobile/mobile-right-sidebar/MobileGitTreeItem.tsx', 'utf8');
code = code.replace(/import \{[\s\S]*?\} from 'lucide-react';/, `import { 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Minus, 
  Undo2 
} from 'lucide-react';
import { FileIcon } from '../../../common/FileIcon';`);

code = code.replace(/\{isOpen \? \([\s\S]*?<FolderOpen size=\{14\} className="text-ink\/70 flex-shrink-0" \/>[\s\S]*?\) : \([\s\S]*?<Folder size=\{14\} className="text-ink\/60 flex-shrink-0" \/>[\s\S]*?\)\}/, `<FileIcon name={node.name} isFolder={true} isOpen={isOpen} size={14} className="flex-shrink-0" />`);

code = code.replace(/\{isMd \? \([\s\S]*?<FileText size=\{13\} className="text-ink\/50 flex-shrink-0" \/>[\s\S]*?\) : \([\s\S]*?<FileCode size=\{13\} className="text-ink\/50 flex-shrink-0" \/>[\s\S]*?\)\}/, `<FileIcon name={node.name} size={13} className="flex-shrink-0" />`);

// Remove const isMd if unused
code = code.replace(/const isMd = [^;]+;/, '');

fs.writeFileSync('app/components/mobile/mobile-right-sidebar/MobileGitTreeItem.tsx', code);
