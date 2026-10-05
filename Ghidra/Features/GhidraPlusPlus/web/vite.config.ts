import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      // The welcome screen's "Try the example" button opens this copy of the example program.
      name: 'example-program',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'example/parcel.exe',
          source: readFileSync(new URL('../examples/parcel.exe', import.meta.url)),
        });
      },
    },
  ],
  base: './',
  build: { outDir: '../data/web', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
});
