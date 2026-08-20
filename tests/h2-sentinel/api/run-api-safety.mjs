const configuredUrl = process.env.H2_ANALYTICS_URL

if (!configuredUrl) {
  console.log('SKIP A01/A04/A07 — H2_ANALYTICS_URL is not set; analytics API is not assembled on H0')
  process.exit(0)
}

const url = new URL(configuredUrl)
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost'])

if (!loopbackHosts.has(url.hostname)) {
  console.error(`FAIL A04 — H2_ANALYTICS_URL must be loopback, received ${url.hostname}`)
  process.exit(1)
}

const healthUrl = new URL('/health', url)
const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) })
const text = await response.text()

if (!response.ok) {
  console.error(`FAIL A01 — health endpoint returned HTTP ${response.status}`)
  process.exit(1)
}

if (/(?:[A-Za-z]:\\|\/home\/|traceback|authorization:|api[_-]?key|password)/i.test(text)) {
  console.error('FAIL A07 — health response exposes redaction-sensitive material')
  process.exit(1)
}

console.log(`PASS A01 — loopback health endpoint returned HTTP ${response.status}`)

const failureUrl = process.env.H2_API_FAILURE_URL
if (!failureUrl) {
  console.log('SKIP A07 — set H2_API_FAILURE_URL to a documented public failure endpoint after API assembly')
  process.exit(0)
}

const failureResponseUrl = new URL(failureUrl)
if (!loopbackHosts.has(failureResponseUrl.hostname)) {
  console.error(`FAIL A07 — H2_API_FAILURE_URL must be loopback, received ${failureResponseUrl.hostname}`)
  process.exit(1)
}

const failureResponse = await fetch(failureResponseUrl, { signal: AbortSignal.timeout(5_000) })
const failureText = await failureResponse.text()
if (failureResponse.ok) {
  console.error('FAIL A07 — configured failure endpoint returned success')
  process.exit(1)
}
if (/(?:[A-Za-z]:\\|\/home\/|traceback|authorization:|api[_-]?key|password)/i.test(failureText)) {
  console.error('FAIL A07 — public failure response exposes redaction-sensitive material')
  process.exit(1)
}

const envelope = JSON.parse(failureText)
if (envelope.ok !== false || envelope.status !== 'error' || typeof envelope.error?.code !== 'string' || typeof envelope.error?.message !== 'string' || typeof envelope.error?.retryable !== 'boolean') {
  console.error('FAIL A07 — failure response does not match the public redacted-error envelope')
  process.exit(1)
}

console.log(`PASS A07 — redacted public failure endpoint returned HTTP ${failureResponse.status}`)
