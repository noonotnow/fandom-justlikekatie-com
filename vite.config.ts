import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  PUBLIC_ORIGIN,
  PUBLIC_CHINESE_LOCALE,
  PUBLIC_LOCALIZED_ROUTE_PATHS,
  PUBLIC_ROUTE_PATHS,
  publicRouteUrl,
  publicStaticPreviewRoutes,
  PUBLIC_EDITORIAL_REDIRECTS,
} from './shared/public-routes.js'
import { localizedPath, stripLocalePath } from './shared/locale.js'

const launchpadCanonicalPlaceholder = '%PUBLIC_LAUNCHPAD_CANONICAL%'
const launchpadOgUrlPlaceholder = '%PUBLIC_LAUNCHPAD_OG_URL%'
const launchpadOgImagePlaceholder = '%PUBLIC_LAUNCHPAD_OG_IMAGE%'
const launchpadChineseCanonicalPlaceholder = '%PUBLIC_LAUNCHPAD_ZH_CANONICAL%'

const launchpadTwitterImagePlaceholder = '%PUBLIC_LAUNCHPAD_TWITTER_IMAGE%'
export const launchpadOgImagePath = '/assets/c-drama-fandom/lg01-master-og.jpg'

const vibeAtlasSocialImage = `${PUBLIC_ORIGIN}/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp`
export function injectLaunchpadCanonical(html: string) {
  const replacements: [string, string, number][] = [
    [launchpadCanonicalPlaceholder, publicRouteUrl(PUBLIC_ROUTE_PATHS.launchpad), 3],
    [launchpadOgUrlPlaceholder, publicRouteUrl(PUBLIC_ROUTE_PATHS.launchpad), 1],
    [launchpadChineseCanonicalPlaceholder, publicRouteUrl(PUBLIC_LOCALIZED_ROUTE_PATHS.launchpad), 1],
    [launchpadOgImagePlaceholder, `${PUBLIC_ORIGIN}${launchpadOgImagePath}`, 1],
    [launchpadTwitterImagePlaceholder, `${PUBLIC_ORIGIN}${launchpadOgImagePath}`, 1],
  ]

  let transformedHtml = html
  for (const [placeholder, value, expected] of replacements) {
    const occurrences = transformedHtml.split(placeholder).length - 1
    if (occurrences !== expected) {
      throw new Error(
        `Expected ${expected} ${placeholder} placeholders in index.html; found ${occurrences}`,
      )
    }
    transformedHtml = transformedHtml.replaceAll(placeholder, value)
  }
  return transformedHtml
}

export function injectAppRouteMetadata(html: string, requestPath: string) {
  const requestUrl = new URL(requestPath, 'http://fandom.local')
  const normalizedPath = requestUrl.pathname.replace(/\/+$/, '') || '/'
  const routePath = stripLocalePath(normalizedPath).replace(/\/+$/, '') || '/'
  const isChinese = routePath !== normalizedPath
  const routeMetadata = routePath === PUBLIC_ROUTE_PATHS.launchpad && isChinese
    ? {
        title: 'Fandom Vibes｜古装剧粉丝指南与 Vibe Atlas',
        description: '探索中国古装剧粉丝文化与 Vibe Atlas：每日精选一位演员、一个氛围主题和九张视觉证据。',
        path: PUBLIC_ROUTE_PATHS.launchpad,
      }
    : routePath === PUBLIC_ROUTE_PATHS.vibeAtlas
    ? {
        title: isChinese ? 'Vibe Atlas｜每日古装剧收藏卡 | Fandom Vibes' : 'Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes',
        description: isChinese
          ? '浏览今日 Vibe Atlas 古装剧收藏卡：一位演员、一个氛围主题，以及九张精选图片。'
          : 'Browse today’s Vibe Atlas C-drama collectible: one star, one vibe, and nine pieces of evidence.',
        path: PUBLIC_ROUTE_PATHS.vibeAtlas,
      }
    : routePath === PUBLIC_ROUTE_PATHS.vibeAtlasArchive
      ? {
          title: isChinese ? 'Vibe Atlas 往期典藏｜每日古装剧收藏卡 | Fandom Vibes' : 'Vibe Atlas Archive | Fandom Vibes',
          description: isChinese
            ? '浏览 Vibe Atlas 往期古装剧收藏卡，每期包含一位演员、一个氛围主题和九张精选图片。'
            : 'Browse past Vibe Atlas C-drama collectible card drops, with one star, one vibe, and nine pieces of evidence in every edition.',
          path: PUBLIC_ROUTE_PATHS.vibeAtlasArchive,
        }
      : null
  if (!routeMetadata) return html

  const canonicalPath = isChinese
    ? localizedPath(routeMetadata.path, PUBLIC_CHINESE_LOCALE)
    : routeMetadata.path
  const canonicalUrl = publicRouteUrl(canonicalPath)
  const englishUrl = publicRouteUrl(routeMetadata.path)
  const chineseUrl = publicRouteUrl(localizedPath(routeMetadata.path, PUBLIC_CHINESE_LOCALE))
  const socialImage = routeMetadata.path === PUBLIC_ROUTE_PATHS.launchpad
    ? `${PUBLIC_ORIGIN}${launchpadOgImagePath}`
    : vibeAtlasSocialImage
  return html
    .replace(/<html lang="[^"]*"/, `<html lang="${isChinese ? PUBLIC_CHINESE_LOCALE : 'en'}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${routeMetadata.title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${routeMetadata.description}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonicalUrl}" />`)
    .replace(/<link rel="alternate" hreflang="en" href="[^"]*" \/>/, `<link rel="alternate" hreflang="en" href="${englishUrl}" />`)
    .replace(/<link rel="alternate" hreflang="zh-CN" href="[^"]*" \/>/, `<link rel="alternate" hreflang="zh-CN" href="${chineseUrl}" />`)
    .replace(/<link rel="alternate" hreflang="x-default" href="[^"]*" \/>/, `<link rel="alternate" hreflang="x-default" href="${englishUrl}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${routeMetadata.title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${routeMetadata.description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonicalUrl}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${socialImage}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${routeMetadata.title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${routeMetadata.description}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${socialImage}" />`)
}
const editorialRouteFiles = new Map(publicStaticPreviewRoutes())
const editorialRedirects = new Map(PUBLIC_EDITORIAL_REDIRECTS.map(({ from, to }) => [from, to]))

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
        server.middlewares.use((request, response, next) => {
          if (!request.url) return next()
          const url = new URL(request.url, 'http://fandom.local')
          const redirect = editorialRedirects.get(url.pathname)
          if (redirect) {
            response.statusCode = 301
            response.setHeader('Location', `${redirect}${url.search}`)
            response.end()
            return
          }
          const localizedRequestPath = url.pathname.replace(/\/+$/, '') || '/'
          const normalizedPath = stripLocalePath(localizedRequestPath).replace(/\/+$/, '') || '/'
          const publicFile = editorialRouteFiles.get(localizedRequestPath)
            || (localizedRequestPath === normalizedPath
              ? editorialRouteFiles.get(normalizedPath)
              : undefined)
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
