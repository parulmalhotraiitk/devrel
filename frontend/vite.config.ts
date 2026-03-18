import { defineConfig } from 'vite'

export default defineConfig({
  root: './',
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080'
    }
  }
})
