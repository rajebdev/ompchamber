const fs = require('fs');
let code = fs.readFileSync('app/components/workspace/FileExplorer.tsx', 'utf8');
code = code.replace(/<FileIcon name={file.name} isFolder={isFolder} isOpen={actualIsOpen} size={12} \/>/, `{isFolder ? (
          actualIsOpen ? <ChevronDown size={12} className="text-ink/40" /> : <ChevronRight size={12} className="text-ink/40" />
        ) : (
          <span className="w-3"></span>
        )}`);
fs.writeFileSync('app/components/workspace/FileExplorer.tsx', code);
