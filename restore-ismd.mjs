import fs from 'fs';
let code = fs.readFileSync('app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx', 'utf8');
code = code.replace(/const lang = getLanguage\(file\.name\);/, `const isMd = file.name.endsWith('.md');\n  const lang = getLanguage(file.name);`);
fs.writeFileSync('app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx', code);
