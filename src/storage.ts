import { SocialAuthError } from './errors'
import type { StorageAdapter } from './types'

class SessionStorageAdapter implements StorageAdapter {
  constructor(private readonly prefix: string) {}
  private key(key: string): string {
    return this.prefix ? `${this.prefix}.${key}` : key
  }
  keys(): string[] {
    const scope = this.prefix ? `${this.prefix}.` : ''
    const out: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i)
      if (key === null) continue
      if (scope && !key.startsWith(scope)) continue
      out.push(scope ? key.slice(scope.length) : key)
    }
    return out
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
    throw new SocialAuthError(
      'config',
      'sessionStorage is required but unavailable. ' +
        'Pass a custom `storage` adapter or enable session storage.',
    )
  }
  return new SessionStorageAdapter(namespace)
}

/**
 * Storage keys for one flow. Scoped by the flow's `state` as well as the
 * provider name so that two concurrent flows for one provider cannot overwrite
 * each other's entries.
 *
 * @param provider - Provider name.
 * @param state - The `state` value identifying this flow.
 */
export function flowKeys(
  provider: string,
  state: string,
): { state: string; verifier: string; expiry: string } {
  return {
    state: `${provider}.${state}.state`,
    verifier: `${provider}.${state}.verifier`,
    expiry: `${provider}.${state}.exp`,
  }
}

/** `<provider>.<state>.exp` — the expiry key shape {@link flowKeys} produces. */
const FLOW_EXPIRY_RE = /^(.+)\.([^.]+)\.exp$/

/**
 * Remove entries left behind by flows that can no longer complete.
 *
 * Keys are scoped per flow so concurrent flows cannot collide, which means an
 * abandoned flow (the opener navigated away while its popup was open) leaves
 * entries nothing would otherwise collect. Each flow records an expiry, and
 * only flows past it are swept — a live concurrent flow is never touched.
 *
 * Expired flows of EVERY provider are swept, not just the one starting the
 * current flow: an abandoned github flow (whose entries include the PKCE
 * `code_verifier`, a secret) must not outlive a tab that only ever runs
 * google flows. Only keys matching the flow-key shape are touched, because
 * with `namespace: ''` or a custom adapter the store may hold unrelated
 * entries.
 *
 * A no-op for custom adapters that do not implement `keys()`.
 *
 * @param storage - The adapter to sweep.
 * @param now - Current epoch milliseconds.
 */
export function sweepExpiredFlows(storage: StorageAdapter, now: number): void {
  const all = storage.keys?.()
  if (!all) return

  for (const key of all) {
    const match = FLOW_EXPIRY_RE.exec(key)
    if (!match) continue
    const expiry = Number(storage.getItem(key))
    if (Number.isFinite(expiry) && expiry > now) continue

    const keys = flowKeys(match[1]!, match[2]!)
    storage.removeItem(keys.state)
    storage.removeItem(keys.verifier)
    storage.removeItem(keys.expiry)
  }
}
