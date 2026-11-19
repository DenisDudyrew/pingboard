import {defineConfig} from 'vite'

export default defineConfig({
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  build: {
    outDir: 'dist',
    lib: {entry: 'app.tsx', name: 'Pingboard', formats: ['iife'], fileName: () => 'pingboard.js'},
  },
})
