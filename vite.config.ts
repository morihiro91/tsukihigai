import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          rapier: ['@dimforge/rapier3d-compat'],
          three: ['three'],
        },
      },
    },
  },
});
