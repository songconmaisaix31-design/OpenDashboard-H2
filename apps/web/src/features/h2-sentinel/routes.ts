export const H2_SENTINEL_ROUTES = [
  'overview',
  'events',
  'diagnosis',
  'analysis',
  'assistant',
  'reports',
] as const

export type H2SentinelRoute = (typeof H2_SENTINEL_ROUTES)[number]

export interface H2NavigationTarget {
  readonly route: H2SentinelRoute
  readonly eventId?: string
}

const routeSet = new Set<string>(H2_SENTINEL_ROUTES)

export function parseH2SentinelHash(hash: string): H2NavigationTarget {
  const normalized = hash.replace(/^#\/?/, '')
  const [namespace, routeCandidate, eventId] = normalized.split('/')

  if (namespace !== 'h2' || !routeCandidate || !routeSet.has(routeCandidate)) {
    return { route: 'overview' }
  }

  const route = routeCandidate as H2SentinelRoute
  if (route === 'diagnosis' && eventId) {
    try {
      return { route, eventId: decodeURIComponent(eventId) }
    } catch {
      return { route: 'overview' }
    }
  }

  return { route }
}

export function toH2SentinelHash(target: H2NavigationTarget): string {
  const eventSegment =
    target.route === 'diagnosis' && target.eventId
      ? `/${encodeURIComponent(target.eventId)}`
      : ''

  return `#h2/${target.route}${eventSegment}`
}
