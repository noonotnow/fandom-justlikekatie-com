import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { PUBLIC_ORIGIN, PUBLIC_ROUTE_PATHS, publicRouteUrl } from './shared/public-routes.js'

const launchpadCanonicalPlaceholder = '%PUBLIC_LAUNCHPAD_CANONICAL%'
const launchpadOgUrlPlaceholder = '%PUBLIC_LAUNCHPAD_OG_URL%'
const launchpadOgImagePlaceholder = '%PUBLIC_LAUNCHPAD_OG_IMAGE%'
const launchpadOgImagePath = '/assets/c-drama-fandom/lg01-master-og.jpg'

export function injectLaunchpadCanonical(html: string) {
  const replacements = new Map([
    [launchpadCanonicalPlaceholder, publicRouteUrl(PUBLIC_ROUTE_PATHS.launchpad)],
    [launchpadOgUrlPlaceholder, publicRouteUrl(PUBLIC_ROUTE_PATHS.launchpad)],
    [launchpadOgImagePlaceholder, `${PUBLIC_ORIGIN}${launchpadOgImagePath}`],
  ])

  let transformedHtml = html
  for (const [placeholder, value] of replacements) {
    const occurrences = transformedHtml.split(placeholder).length - 1
    if (occurrences !== 1) {
      throw new Error(
        `Expected exactly one ${placeholder} placeholder in index.html; found ${occurrences}`,
      )
    }
    transformedHtml = transformedHtml.replace(placeholder, value)
  }
  return transformedHtml
}

const editorialRouteFiles = new Map([
  ['/c-drama-fandom', '/c-drama-fandom/index.html'],
  ['/c-drama-fandom/getting-started', '/c-drama-fandom/getting-started/index.html'],
  ['/c-drama-fandom/glossary', '/c-drama-fandom/glossary/index.html'],
  ['/c-drama-fandom/glossary/cp', '/c-drama-fandom/glossary/cp/index.html'],
  ['/c-drama-fandom/glossary/cultivation', '/c-drama-fandom/glossary/cultivation/index.html'],
  ['/c-drama-fandom/glossary/xianxia', '/c-drama-fandom/glossary/xianxia/index.html'],
  ['/c-drama-fandom/glossary/jianghu', '/c-drama-fandom/glossary/jianghu/index.html'],
  ['/c-drama-fandom/glossary/wuxia', '/c-drama-fandom/glossary/wuxia/index.html'],
  ['/c-drama-fandom/glossary/wuxia-vs-xianxia-vs-xuanhuan', '/c-drama-fandom/glossary/wuxia-vs-xianxia-vs-xuanhuan/index.html'],
  ['/c-drama-fandom/glossary/historical-vs-costume-drama', '/c-drama-fandom/glossary/historical-vs-costume-drama/index.html'],
  ['/c-drama-fandom/glossary/duanju-microdrama-vertical-drama', '/c-drama-fandom/glossary/duanju-microdrama-vertical-drama/index.html'],
  ['/c-drama-fandom/archetypes', '/c-drama-fandom/archetypes/index.html'],
  ['/c-drama-fandom/archetypes/cold-male-lead-vs-tsundere', '/c-drama-fandom/archetypes/cold-male-lead-vs-tsundere/index.html'],
  ['/c-drama-fandom/archetypes/black-bellied-vs-white-cut-black', '/c-drama-fandom/archetypes/black-bellied-vs-white-cut-black/index.html'],
  ['/c-drama-fandom/archetypes/white-moonlight-vs-cinnabar-mole', '/c-drama-fandom/archetypes/white-moonlight-vs-cinnabar-mole/index.html'],
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
      name: 'fandom-launchpad-canonical',
      transformIndexHtml: {
        order: 'pre',
        handler: injectLaunchpadCanonical,
      },
    },
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
