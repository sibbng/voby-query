import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      'voby-query': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
});
