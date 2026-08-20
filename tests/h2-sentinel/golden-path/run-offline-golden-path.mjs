const configuredUrl = process.env.H2_WEB_URL

if (!configuredUrl) {
  console.log('SKIP A03/A06/A08 — H2_WEB_URL is not set; H2 Web composition is not assembled on H0')
  process.exit(0)
}

const url = new URL(configuredUrl)
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])

if (!loopbackHosts.has(url.hostname)) {
  console.error(`FAIL A03 — H2_WEB_URL must be loopback, received ${url.hostname}`)
  process.exit(1)
}

const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
if (!response.ok) {
  console.error(`FAIL A08 — Web entry returned HTTP ${response.status}`)
  process.exit(1)
}

console.log(`PASS A08 — loopback Web entry returned HTTP ${response.status}`)
console.log('SKIP A03/A06 — browser-level C03/C04 and provenance checks require the assembled route contract')
