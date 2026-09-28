import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  PUBLIC_ORIGIN,
  PUBLIC_ROUTE_PATHS,
  publicRouteUrl,
  publicStaticPreviewRoutes,
} from './shared/public-routes.js'

const launchpadCanonicalPlaceholder = '%PUBLIC_LAUNCHPAD_CANONICAL%'
const launchpadOgUrlPlaceholder = '%PUBLIC_LAUNCHPAD_OG_URL%'
const launchpadOgImagePlaceholder = '%PUBLIC_LAUNCHPAD_OG_IMAGE%'

const launchpadTwitterImagePlaceholder = '%PUBLIC_LAUNCHPAD_TWITTER_IMAGE%'
export const launchpadOgImagePath = '/assets/c-drama-fandom/lg01-master-og.jpg'

const vibeAtlasSocialImage = `${PUBLIC_ORIGIN}/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp`
export function injectLaunchpadCanonical(html: string) {
  const replacements = new Map([
    [launchpadCanonicalPlaceholder, publicRouteUrl(PUBLIC_ROUTE_PATHS.launchpad)],
    [launchpadOgUrlPlaceholder, publicRouteUrl(PUBLIC_ROUTE_PATHS.launchpad)],
    [launchpadOgImagePlaceholder, `${PUBLIC_ORIGIN}${launchpadOgImagePath}`],
    [launchpadTwitterImagePlaceholder, `${PUBLIC_ORIGIN}${launchpadOgImagePath}`],
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

export function injectAppRouteMetadata(html: string, requestPath: string) {
  const normalizedPath = new URL(requestPath, 'http://fandom.local').pathname.replace(/\/+$/, '') || '/'
  const routeMetadata = normalizedPath === PUBLIC_ROUTE_PATHS.vibeAtlas
    ? {
        title: 'Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes',
        description: 'Browse today’s Vibe Atlas C-drama collectible: one star, one vibe, and nine pieces of evidence.',
        path: PUBLIC_ROUTE_PATHS.vibeAtlas,
      }
    : normalizedPath === PUBLIC_ROUTE_PATHS.vibeAtlasArchive
      ? {
          title: 'Vibe Atlas Archive | Fandom Vibes',
          description: 'Browse past Vibe Atlas C-drama collectible card drops, with one star, one vibe, and nine pieces of evidence in every edition.',
          path: PUBLIC_ROUTE_PATHS.vibeAtlasArchive,
        }
      : null
  if (!routeMetadata) return html

  const url = publicRouteUrl(routeMetadata.path)
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${routeMetadata.title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${routeMetadata.description}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${routeMetadata.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${routeMetadata.description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${vibeAtlasSocialImage}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${routeMetadata.title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${routeMetadata.description}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${vibeAtlasSocialImage}" />`)
}
const editorialRouteFiles = new Map(publicStaticPreviewRoutes())

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'fandom-app-route-metadata',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          return injectAppRouteMetadata(
            injectLaunchpadCanonical(html),
            context.originalUrl ?? '/',
          )
        },
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
