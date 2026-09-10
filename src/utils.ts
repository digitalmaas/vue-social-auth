export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

export function camelCase(name: string): string {
  return name.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
}

export function getOrigin(): string {
  return typeof window !== 'undefined' && window.location ? window.location.origin : ''
}

export function buildRedirectUri(uri?: string): string {
  const origin = getOrigin()
  if (!uri) return origin
  if (!origin) return uri
  // Resolve through the URL API so this agrees byte-for-byte with the popup's
  // own resolution of the same field (origin + pathname matching).
  return new URL(uri, origin).href
}

export function parseQuery(query: string): Record<string, string> {
  // URLSearchParams tolerates a malformed percent-escape (a stray `%`), where
  // decodeURIComponent would throw URIError out of the popup poll loop.
  return Object.fromEntries(new URLSearchParams(query.replace(/^[?#]/, '')))
}

export function randomString(length = 32): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

export function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
