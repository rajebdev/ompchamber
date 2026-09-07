import fs from 'fs';
let code = fs.readFileSync('app/components/mobile/mobile-right-sidebar/MobileGitTreeItem.tsx', 'utf8');
code = code.replace(/istoggleonAction,/, `isFolderOpen,\n  toggleFolder,\n  onAction,`);
fs.writeFileSync('app/components/mobile/mobile-right-sidebar/MobileGitTreeItem.tsx', code);

code = fs.readFileSync('app/components/workspace/git-panel/GitTreeItem.tsx', 'utf8');
code = code.replace(/istoggleonAction,/, `isFolderOpen,\n  toggleFolder,\n  onAction,`);
fs.writeFileSync('app/components/workspace/git-panel/GitTreeItem.tsx', code);
