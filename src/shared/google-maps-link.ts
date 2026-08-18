import { isValidCoordinates } from './coordinate-validation'
import type { GoogleMapsLinkErrorCode, GoogleMapsLinkResult } from './types'

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_MAX_REDIRECTS = 5
const MAPS_APP_TOKEN_PATH = /^\/[A-Za-z0-9_-]+$/
const COORDINATE_PAIR = /^\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*$/
const AT_COORDINATES = /@(-?(?:\d+(?:\.\d+)?|\.\d+)),(-?(?:\d+(?:\.\d+)?|\.\d+))(?:,|\/|$)/
const DATA_LATITUDE = /!3d(-?(?:\d+(?:\.\d+)?|\.\d+))/
const DATA_LONGITUDE = /!4d(-?(?:\d+(?:\.\d+)?|\.\d+))/

const ERROR_MESSAGES: Record<GoogleMapsLinkErrorCode, string> = {
  'unsupported-url': 'Enter a supported Google Maps sharing link.',
  'no-coordinates': 'This Google Maps link does not contain coordinates.',
  'invalid-coordinates': 'The Google Maps link contains invalid coordinates.',
  'redirect-rejected': 'The Google Maps link redirected to an unsupported destination.',
  'too-many-redirects': 'The Google Maps link redirected too many times.',
  timeout: 'Google Maps link resolution timed out. Try again.',
  'network-error': 'Could not resolve the Google Maps link. Check the network and try again.'
}

export interface GoogleMapsResolverOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxRedirects?: number
}

function failure(code: GoogleMapsLinkErrorCode): GoogleMapsLinkResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] }
}

function isAllowedUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false

  const host = url.hostname.toLowerCase()
  const path = url.pathname
  if (host === 'goo.gl') return path === '/maps' || path.startsWith('/maps/')
  if (host === 'maps.app.goo.gl') return MAPS_APP_TOKEN_PATH.test(path)
  if (host === 'google.com' || host === 'www.google.com') {
    return path === '/maps' || path.startsWith('/maps/')
  }
  if (host === 'maps.google.com') {
    return path === '/' || path === '/maps' || path.startsWith('/maps/')
  }
  return false
}

function isShortLink(url: URL): boolean {
  return url.hostname.toLowerCase() === 'goo.gl' || url.hostname.toLowerCase() === 'maps.app.goo.gl'
}

function parseCandidate(latText: string, lngText: string): GoogleMapsLinkResult {
  const lat = Number(latText)
  const lng = Number(lngText)
  return isValidCoordinates(lat, lng)
    ? { ok: true, lat, lng }
    : failure('invalid-coordinates')
}

export function extractGoogleMapsCoordinates(url: URL): GoogleMapsLinkResult | null {
  for (const key of ['q', 'query']) {
    const value = url.searchParams.get(key)
    if (!value) continue
    const match = COORDINATE_PAIR.exec(value)
    if (match) return parseCandidate(match[1], match[2])
  }

  const atMatch = AT_COORDINATES.exec(url.href)
  if (atMatch) return parseCandidate(atMatch[1], atMatch[2])

  const latitudeMatch = DATA_LATITUDE.exec(url.href)
  const longitudeMatch = DATA_LONGITUDE.exec(url.href)
  if (latitudeMatch && longitudeMatch) {
    return parseCandidate(latitudeMatch[1], longitudeMatch[1])
  }

  return null
}

export async function resolveGoogleMapsLink(
  rawUrl: string,
  options: GoogleMapsResolverOptions = {}
): Promise<GoogleMapsLinkResult> {
  let currentUrl: URL
  try {
    currentUrl = new URL(rawUrl.trim())
  } catch {
    return failure('unsupported-url')
  }

  if (!isAllowedUrl(currentUrl)) return failure('unsupported-url')

  const initialCoordinates = extractGoogleMapsCoordinates(currentUrl)
  if (initialCoordinates) return initialCoordinates
  if (!isShortLink(currentUrl)) return failure('no-coordinates')

  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const deadline = Date.now() + timeoutMs
  const visited = new Set<string>()

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const key = currentUrl.href
    if (visited.has(key)) return failure('redirect-rejected')
    visited.add(key)

    const coordinates = extractGoogleMapsCoordinates(currentUrl)
    if (coordinates) return coordinates
    if (redirectCount === maxRedirects) return failure('too-many-redirects')

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return failure('timeout')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), remainingMs)
    let response: Response
    try {
      response = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal
      })
    } catch {
      return failure(controller.signal.aborted ? 'timeout' : 'network-error')
    } finally {
      clearTimeout(timeout)
    }

    const location = response.headers.get('location')
    await response.body?.cancel().catch(() => undefined)
    if (response.status < 300 || response.status >= 400 || !location) {
      return failure('no-coordinates')
    }

    try {
      currentUrl = new URL(location, currentUrl)
    } catch {
      return failure('redirect-rejected')
    }
    if (!isAllowedUrl(currentUrl)) return failure('redirect-rejected')
  }

  return failure('too-many-redirects')
}
