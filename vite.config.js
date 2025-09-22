import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: '../static',
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
        demo3: resolve(__dirname, 'src/index3.html'),
        demo4: resolve(__dirname, 'src/index4.html'),
        demo5: resolve(__dirname, 'src/index5.html')
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