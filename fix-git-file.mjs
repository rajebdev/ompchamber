import fs from 'fs';
let code = fs.readFileSync('app/components/workspace/git-panel/GitFileItem.tsx', 'utf8');
code = code.replace(/import \{ FileText, Undo2, Plus, Minus \} from 'lucide-react';/, `import { Undo2, Plus, Minus } from 'lucide-react';
import { FileIcon } from '../../common/FileIcon';`);

code = code.replace(/<FileText size=\{12\} className="text-ink\/60 flex-shrink-0" \/>/, `<FileIcon name={fileName} size={12} className="flex-shrink-0" />`);

fs.writeFileSync('app/components/workspace/git-panel/GitFileItem.tsx', code);
