import type { StorageAdapter } from './types'

class SessionStorageAdapter implements StorageAdapter {
  constructor(private readonly prefix: string) {}
  private key(key: string): string {
    return this.prefix ? `${this.prefix}.${key}` : key
  }
  getItem(key: string): string | null {
    return window.sessionStorage.getItem(this.key(key))
  }
  setItem(key: string, value: string): void {
    window.sessionStorage.setItem(this.key(key), value)
  }
  removeItem(key: string): void {
    window.sessionStorage.removeItem(this.key(key))
  }
}

function probeSessionStorage(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const probe = `__vsa_probe_${Math.random()}`
    window.sessionStorage.setItem(probe, '1')
    window.sessionStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the storage adapter the library uses for the OAuth `state` and PKCE
 * `code_verifier`. Returns the supplied custom adapter when present;
 * otherwise builds a `sessionStorage`-backed adapter that prefixes every key
 * with `namespace`.
 *
 * @param adapter - A custom adapter, or `undefined` to use `sessionStorage`.
 * @param namespace - Prefix prepended to every key, separated by `.`. Pass
 *   an empty string to disable prefixing.
 *
 * @returns A {@link StorageAdapter} ready to be passed to the OAuth runner.
 *
 * @throws If `adapter` is `undefined` and `window.sessionStorage` is
 *   unavailable (SSR, private mode in some browsers). Pass a custom adapter
 *   to recover.
 *
 * @public
 */
export function createStorage(
  adapter: StorageAdapter | undefined,
  namespace = 'vue-social-auth',
): StorageAdapter {
  if (adapter) return adapter
  if (!probeSessionStorage()) {
    throw new Error(
      'vue-social-auth: sessionStorage is required but unavailable. ' +
        'Pass a custom `storage` adapter or enable session storage.',
    )
  }
  return new SessionStorageAdapter(namespace)
}
