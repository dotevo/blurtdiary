import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteExternalsPlugin } from 'vite-plugin-externals';

// dblurt is loaded as a global from public/vendor/dblurt/dblurt.js (same as BlurtForum).
export default defineConfig({
  plugins: [vue(), viteExternalsPlugin({ '@beblurt/dblurt': 'dblurt' })],
  server: { host: true },
  // GitHub Pages: workflow passes VITE_BASE (repo var); './' works for any sub-path.
  base: process.env.VITE_BASE ?? './',
  build: { outDir: 'dist' },
});
