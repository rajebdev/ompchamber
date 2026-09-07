import fs from 'fs';

const files = [
  'app/components/mobile/mobile-right-sidebar/MobileGitTreeItem.tsx',
  'app/components/mobile/mobile-right-sidebar/MobileGitFileItem.tsx',
  'app/components/workspace/git-panel/GitTreeItem.tsx',
  'app/components/workspace/git-panel/GitFileItem.tsx',
  'app/components/workspace/Editor.tsx',
  'app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx',
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  // Remove FileText, FileCode, Folder, FolderOpen from lucide-react imports if they are there
  code = code.replace(/FileText,\s*/g, '');
  code = code.replace(/FileCode,\s*/g, '');
  code = code.replace(/Folder,\s*/g, '');
  code = code.replace(/FolderOpen,\s*/g, '');
  fs.writeFileSync(file, code);
}
