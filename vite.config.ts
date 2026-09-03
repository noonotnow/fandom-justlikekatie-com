import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const editorialRouteFiles = new Map([
  ['/c-drama-fandom', '/c-drama-fandom/index.html'],
  ['/c-drama-fandom/getting-started', '/c-drama-fandom/getting-started/index.html'],
  ['/c-drama-fandom/glossary', '/c-drama-fandom/glossary/index.html'],
  ['/c-drama-fandom/glossary/cp', '/c-drama-fandom/glossary/cp/index.html'],
  ['/c-drama-fandom/glossary/cultivation', '/c-drama-fandom/glossary/cultivation/index.html'],
  ['/c-drama-fandom/glossary/xianxia', '/c-drama-fandom/glossary/xianxia/index.html'],
  ['/c-drama-fandom/glossary/jianghu', '/c-drama-fandom/glossary/jianghu/index.html'],
  ['/c-drama-fandom/trope-decoder', '/c-drama-fandom/trope-decoder/index.html'],
  ['/c-drama-fandom/fandom-games', '/c-drama-fandom/fandom-games/index.html'],
  ['/c-drama-fandom/watch-journal', '/c-drama-fandom/watch-journal/index.html'],
  ...[
    [1, 4], [5, 8], [9, 12], [13, 16], [17, 20], [21, 24], [25, 28],
    [29, 32], [33, 36], [37, 40], [41, 44], [45, 48], [49, 50],
  ].map(([start, end]): [string, string] => [
    `/c-drama-fandom/watch-journal/episodes-${start}-${end}`,
    `/c-drama-fandom/watch-journal/episodes-${start}-${end}/index.html`,
  ]),
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
