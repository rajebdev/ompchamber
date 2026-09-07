import fs from 'fs';
let code = fs.readFileSync('app/components/workspace/Editor.tsx', 'utf8');

// The titles were added directly to the lucide icons, let's wrap them in a container with title or remove them.
// Removing title="XYZ" from <WrapText, <ZoomOut, <ZoomIn, <Copy, <Download, <Maximize
code = code.replace(/title="Toggle Word Wrap"/g, '');
code = code.replace(/title="Zoom Out"/g, '');
code = code.replace(/title="Zoom In"/g, '');
code = code.replace(/title="Copy"/g, '');
code = code.replace(/title="Download"/g, '');
code = code.replace(/title="Maximize"/g, '');

fs.writeFileSync('app/components/workspace/Editor.tsx', code);
