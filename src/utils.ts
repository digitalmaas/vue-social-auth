export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function camelCase(name: string): string {
  return name.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
}

export function joinUrl(base: string | null | undefined, path: string): string {
  if (!base) return path
  if (/^https?:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function getOrigin(): string {
  return typeof window !== 'undefined' && window.location ? window.location.origin : ''
}

export function buildRedirectUri(uri?: string): string {
  const origin = getOrigin()
  if (!uri) return origin
  if (/^https?:\/\//i.test(uri)) return uri
  return `${origin}${uri.startsWith('/') ? '' : '/'}${uri}`
}

export function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {}
  const search = query.replace(/^[?#]/, '')
  if (!search) return out
  for (const pair of search.split('&')) {
    if (!pair) continue
    const idx = pair.indexOf('=')
    const key = idx === -1 ? pair : pair.slice(0, idx)
    const value = idx === -1 ? '' : pair.slice(idx + 1)
    out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '))
  }
  return out
}

export function encodeForm(data: Record<string, string>): string {
  return Object.keys(data)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(data[k] ?? '')}`)
    .join('&')
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
