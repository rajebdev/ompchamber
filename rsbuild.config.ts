import { defineConfig } from '@rsbuild/core';
import { pluginPreact } from '@rsbuild/plugin-preact';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  // Third-party shim only — src/ imports preact directly. react-resizable-panels,
  // react-simple-code-editor, and react-icons import 'react' in their own code,
  // so this alias is what keeps them on Preact. See the note in tsconfig.json.
  plugins: [pluginPreact({ reactAliasesEnabled: true })],

  source: {
    entry: { index: './src/client/main.tsx' },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    },
  },

  resolve: {
    alias: {
      '@': './src',
    },
  },

  html: {
    template: './index.html',
  },

  output: {
    distPath: { root: 'dist/client' },
    sourceMap: isDev,
    // The remaining >500 kB chunks are lazy-loaded vendor libraries
    // (mermaid/elk/cynefin diagrams, katex) that never block initial paint.
    dataUriLimit: 4096,
  },

  server: {
    port: 3000,
    host: '0.0.0.0',
    publicDir: { name: 'public' },
  },

  performance: {
    chunkSplit: {
      strategy: 'custom',
      splitChunks: {
        cacheGroups: {
          katex: { test: /node_modules[\\/]katex/, name: 'katex-vendor', chunks: 'all', enforce: true },
          markdown: {
            test: /node_modules[\\/](remend|marked)/,
            name: 'markdown-vendor',
            chunks: 'all',
            enforce: true,
          },
          prism: { test: /node_modules[\\/]prismjs/, name: 'prism-vendor', chunks: 'all', enforce: true },
        },
      },
    },
  },
});
