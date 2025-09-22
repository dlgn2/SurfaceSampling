import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  base: './',
  server: {
    port: 3000,
    open: true,
    host: true
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        demo2: resolve(__dirname, 'src/index2.html'),
        demo3: resolve(__dirname, 'src/index3.html')
      }
    }
  },
  resolve: {
    alias: {
      'three': 'three'
    }
  },
  optimizeDeps: {
    include: ['three']
  }
});