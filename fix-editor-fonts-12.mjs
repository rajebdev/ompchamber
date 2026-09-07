import fs from 'fs';

let desktopCode = fs.readFileSync('app/components/workspace/Editor.tsx', 'utf8');
desktopCode = desktopCode.replace(/const \[zoomLevel, setZoomLevel\] = useState\(13\);/, 'const [zoomLevel, setZoomLevel] = useState(12);');
fs.writeFileSync('app/components/workspace/Editor.tsx', desktopCode);

let mobileCode = fs.readFileSync('app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx', 'utf8');
mobileCode = mobileCode.replace(/const \[fontSize, setFontSize\] = useState\(13\);/, 'const [fontSize, setFontSize] = useState(12);');
fs.writeFileSync('app/components/mobile/mobile-right-sidebar/MobileFullEditor.tsx', mobileCode);
