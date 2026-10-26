import { defineConfig } from 'vite'

export default defineConfig({
  // Serve all files from FRONTEND root
  root: '.',
  // Proxy /api/* to Flask backend during development
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})
