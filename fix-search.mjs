import fs from 'fs';
let code = fs.readFileSync('app/components/workspace/SearchPanel.tsx', 'utf8');
code = code.replace(/import \{ Search, CaseSensitive, WholeWord, Regex, Replace, ReplaceAll, MoreHorizontal, Check \} from 'lucide-react';/, `import { Search, CaseSensitive, WholeWord, Regex, Replace, ReplaceAll, MoreHorizontal, Check } from 'lucide-react';
import { FileIcon } from '../common/FileIcon';`);

code = code.replace(/<span className="truncate">\{file\}<\/span>/, `<FileIcon name={file} size={12} className="mr-1.5 flex-shrink-0" />
                    <span className="truncate">{file}</span>`);

fs.writeFileSync('app/components/workspace/SearchPanel.tsx', code);
