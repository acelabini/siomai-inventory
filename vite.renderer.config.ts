import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  build: {
    outDir: path.resolve('.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
