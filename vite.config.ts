import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const editorialRouteFiles = new Map([
  ['/c-drama-fandom', '/c-drama-fandom/index.html'],
  ['/c-drama-fandom/getting-started', '/c-drama-fandom/getting-started/index.html'],
  ['/c-drama-fandom/glossary', '/c-drama-fandom/glossary/index.html'],
  ['/c-drama-fandom/trope-decoder', '/c-drama-fandom/trope-decoder/index.html'],
  ['/c-drama-fandom/fandom-games', '/c-drama-fandom/fandom-games/index.html'],
])

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'fandom-editorial-clean-routes',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (!request.url) return next()
          const url = new URL(request.url, 'http://fandom.local')
          const normalizedPath = url.pathname.replace(/\/+$/, '') || '/'
          const publicFile = editorialRouteFiles.get(normalizedPath)
          if (publicFile) request.url = `${publicFile}${url.search}`
          next()
        })
      },
    },
    react(),
  ],
  server: {
    host: true,
    port: 5000,
    strictPort: true,
  },
})
