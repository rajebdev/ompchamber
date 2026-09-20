export function getDefaultContent(name: string) {
  if (name.endsWith('.md')) {
    return `# ${name.replace('.md', '')}\n\nThis is a mock markdown file.\n\n- You can edit this text\n- Click the eye icon above to toggle preview`;
  }
  if (name.endsWith('.tsx') || name.endsWith('.ts')) {
    const compName = name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
    return `import React from 'react';\n\nexport default function ${compName || 'Component'}() {\n  return (\n    <div>\n      Hello World\n    </div>\n  );\n}`;
  }
  if (name.endsWith('.json')) {
    return `{\n  "name": "omp-project",\n  "version": "1.0.0"\n}`;
  }
  if (name.endsWith('.css')) {
    return `.container {\n  display: flex;\n  flex-direction: column;\n}`;
  }
  return `Content for ${name}`;
}
