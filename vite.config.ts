import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'typeopen-file-url-index',
      apply: 'build',
      transformIndexHtml(html) {
        // The native renderer scheme is same-origin and local, so production
        // assets do not need cross-origin fetch semantics.
        return html.replace(/\s+crossorigin(?=[\s>])/g, '')
      }
    }
  ],
  base: './',
  build: {
    outDir: 'dist',
    // The packaged renderer is local and served by typeopen://. Module preload
    // hints add startup requests without network latency.
    modulePreload: false,
    // Production source maps add tens of megabytes to the packaged app and are
    // not required at runtime. Keep source maps in development through Vite's
    // normal dev server instead of shipping them in the DMG.
    sourcemap: false,
    // The native shell supports macOS 13+, whose system WKWebView starts at
    // Safari/WebKit 16. Keep the renderer syntax compatible with that floor.
    target: 'safari16'
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  }
})
