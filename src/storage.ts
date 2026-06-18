import type { StorageAdapter, StorageType } from './types'

class WebStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: Storage, private readonly prefix: string) {}
  private key(key: string): string {
    return this.prefix ? `${this.prefix}.${key}` : key
  }
  getItem(key: string): string | null {
    return this.storage.getItem(this.key(key))
  }
  setItem(key: string, value: string): void {
    this.storage.setItem(this.key(key), value)
  }
  removeItem(key: string): void {
    this.storage.removeItem(this.key(key))
  }
}

class MemoryAdapter implements StorageAdapter {
  private readonly data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
}

function hasWindowStorage(kind: 'localStorage' | 'sessionStorage'): boolean {
  try {
    if (typeof window === 'undefined') return false
    const s = window[kind]
    const probe = `__vsa_probe_${Math.random()}`
    s.setItem(probe, '1')
    s.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export function createStorage(
  type: StorageType | StorageAdapter = 'session',
  namespace = 'vue-social-auth',
): StorageAdapter {
  if (typeof type === 'object') return type
  if (type === 'local' && hasWindowStorage('localStorage')) {
    return new WebStorageAdapter(window.localStorage, namespace)
  }
  if (type === 'session' && hasWindowStorage('sessionStorage')) {
    return new WebStorageAdapter(window.sessionStorage, namespace)
  }
  return new MemoryAdapter()
}
