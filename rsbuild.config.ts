import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginPreact } from '@rsbuild/plugin-preact';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: [pluginPreact()],

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

  tools: {
    rspack: {
      resolve: {
        // `mermaid.ts` pins `layout: 'dagre'`, so the only code path that reaches
        // elkjs (mermaid's `runElkLayoutCore`) is never entered. Aliasing the
        // package out drops the client build's single largest asset (~1.4 MB raw,
        // 434 kB gzip); the stub throws if a diagram explicitly asks for ELK.
        alias: {
          'elkjs/lib/elk.bundled.js$': path.resolve(__dirname, 'src/client/stubs/elkjs.ts'),
          'elkjs$': path.resolve(__dirname, 'src/client/stubs/elkjs.ts'),
        },
      },
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

  // Dev-only HMR setup. The Bun server (port 3000) stays the single entry
  // point: `writeToDisk` makes rsbuild emit the HMR-injected `index.html` and
  // its assets into `dist/client`, so `ssr.ts` serves the shell (and injects
  // theme/bootstrap) without changes. Asset URLs stay relative, so the Bun
  // static handler serves everything from disk; only assets rsbuild generates
  // per-update (hot-update chunks) miss on disk and are proxied to the dev
  // server by `src/server/plugins/dev-assets.ts`. `dev.client.port` points the
  // HMR websocket straight at rsbuild, because Elysia cannot proxy WebSockets.
  ...(isDev
    ? {
        dev: {
          writeToDisk: true,
          client: { protocol: 'ws' as const, port: 3100 },
          // Lazy compilation's runtime POSTs to /_rspack/lazy/trigger on the
          // page origin (3000), where the endpoint only exists on the rsbuild
          // dev server (3100) — a 404 that makes the page reload in a loop.
          lazyCompilation: false,
        },
      }
    : {}),
  server: {
    port: isDev ? 3100 : 3000,
    host: '0.0.0.0',
    // The Bun server on port 3000 is the app entry point; the rsbuild URL
    // banner would mislead people into opening the HMR helper port instead.
    printUrls: false,
    publicDir: { name: 'public' },
  },

  performance: {
    chunkSplit: {
      strategy: 'custom',
      splitChunks: {
        cacheGroups: {
          // `chunks: 'async'` (not 'all'): katex is imported lazily by
          // `lib/markdown/katex.ts`, so it must stay out of the initial bundle.
          // 'all' would hoist it into a synchronous chunk and every page load
          // would pay ~522 kB for math most messages never contain.
          katex: { test: /node_modules[\\/]katex/, name: 'katex-vendor', chunks: 'async', enforce: true },
          markdown: {
            test: /node_modules[\\/](remend|marked)/,
            name: 'markdown-vendor',
            chunks: 'all',
            enforce: true,
          },
          // `chunks: 'initial'` is deliberate: the 58 `@shikijs/langs/*` dynamic
          // imports must stay split as lazy async chunks. `chunks: 'all'` merges
          // them into this file (~3.3 MB sync) and duplicates them in async/.
          shiki: { test: /node_modules[\\/](shiki|@shikijs)/, name: 'shiki-vendor', chunks: 'initial', enforce: true },
        },
      },
    },
  },
});
