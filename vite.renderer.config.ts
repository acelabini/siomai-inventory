import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';

// The dev server injects CSS as inline <style> tags and React Refresh as an inline
// script, both of which the strict production CSP blocks. Relax it only while serving.
function devContentSecurityPolicy(): Plugin {
  return {
    name: 'dev-content-security-policy',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
    },
  };
}

export default defineConfig({
  root: 'src/renderer',
  plugins: [react(), devContentSecurityPolicy()],
  build: {
    outDir: path.resolve('.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
