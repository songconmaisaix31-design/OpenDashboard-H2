/** Computes the canonical browser-safe SHA-256 descriptor value. */
export async function sha256(content: string): Promise<`sha256:${string}`> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  )
  const hex = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
  return `sha256:${hex}`
}
