import fs from 'fs';
let code = fs.readFileSync('app/components/workspace/git-panel/GitTreeItem.tsx', 'utf8');
code = code.replace(/import \{[\s\S]*?\} from 'lucide-react';/, `import { 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Minus, 
  Undo2 
} from 'lucide-react';
import { FileIcon } from '../../common/FileIcon';`);

code = code.replace(/\{isOpen \? \([\s\S]*?<FolderOpen size=\{13\} className="text-ink\/70 flex-shrink-0" \/>[\s\S]*?\) : \([\s\S]*?<Folder size=\{13\} className="text-ink\/60 flex-shrink-0" \/>[\s\S]*?\)\}/, `<FileIcon name={node.name} isFolder={true} isOpen={isOpen} size={13} className="flex-shrink-0" />`);

code = code.replace(/<FileText size=\{12\} className="text-ink\/60 flex-shrink-0" \/>/, `<FileIcon name={node.name} size={12} className="flex-shrink-0" />`);

fs.writeFileSync('app/components/workspace/git-panel/GitTreeItem.tsx', code);
