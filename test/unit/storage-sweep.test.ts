import { beforeEach, describe, expect, it } from 'vitest'

import { createStorage, flowKeys, sweepExpiredFlows } from '../../src/storage'

/**
 * Flow-scoped keys mean an abandoned flow (opener navigated away while its
 * popup was open) leaves entries nothing else would collect. The sweep must
 * reclaim those without touching a flow that is still live.
 */
const NOW = 1_000_000

function seed(provider: string, state: string, expiry: number) {
  const storage = createStorage(undefined, 'ns')
  const keys = flowKeys(provider, state)
  storage.setItem(keys.state, state)
  storage.setItem(keys.verifier, `verifier-${state}`)
  storage.setItem(keys.expiry, String(expiry))
  return { storage, keys }
}

describe('sweepExpiredFlows', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('removes every key of a flow whose expiry has passed', () => {
    const { storage, keys } = seed('google', 'OLD', NOW - 1)

    sweepExpiredFlows(storage, NOW)

    expect(storage.getItem(keys.state)).toBeNull()
    expect(storage.getItem(keys.verifier)).toBeNull()
    expect(storage.getItem(keys.expiry)).toBeNull()
  })

  it('leaves a flow that has not expired alone', () => {
    const { storage, keys } = seed('google', 'LIVE', NOW + 60_000)

    sweepExpiredFlows(storage, NOW)

    expect(storage.getItem(keys.state)).toBe('LIVE')
    expect(storage.getItem(keys.verifier)).toBe('verifier-LIVE')
  })

  it('sweeps an expired flow while a concurrent live flow survives', () => {
    const { keys: stale } = seed('google', 'OLD', NOW - 1)
    const { storage, keys: live } = seed('google', 'LIVE', NOW + 60_000)

    sweepExpiredFlows(storage, NOW)

    expect(storage.getItem(stale.state)).toBeNull()
    expect(storage.getItem(live.state)).toBe('LIVE')
  })

  it("sweeps another provider's expired flow too: the verifier is a secret", () => {
    const { keys: other } = seed('github', 'OLD', NOW - 1)
    const { storage } = seed('google', 'LIVE', NOW + 60_000)

    sweepExpiredFlows(storage, NOW)

    expect(storage.getItem(other.state)).toBeNull()
    expect(storage.getItem(other.verifier)).toBeNull()
  })

  it('leaves keys that are not flow keys alone (shared/unnamespaced stores)', () => {
    const { storage } = seed('google', 'OLD', NOW - 1)
    storage.setItem('unrelated', 'keep')
    storage.setItem('also.unrelated', 'keep')

    sweepExpiredFlows(storage, NOW)

    expect(storage.getItem('unrelated')).toBe('keep')
    expect(storage.getItem('also.unrelated')).toBe('keep')
  })

  it('is a no-op for a custom adapter that cannot enumerate keys', () => {
    const data = new Map<string, string>([['google.OLD.exp', '1']])
    const adapter = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    }

    expect(() => sweepExpiredFlows(adapter, NOW)).not.toThrow()
    expect(data.size).toBe(1)
  })
})
