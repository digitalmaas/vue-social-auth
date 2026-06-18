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
