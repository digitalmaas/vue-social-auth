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

    sweepExpiredFlows(storage, 'google', NOW)

    expect(storage.getItem(keys.state)).toBeNull()
    expect(storage.getItem(keys.verifier)).toBeNull()
    expect(storage.getItem(keys.expiry)).toBeNull()
  })

  it('leaves a flow that has not expired alone', () => {
    const { storage, keys } = seed('google', 'LIVE', NOW + 60_000)

    sweepExpiredFlows(storage, 'google', NOW)

    expect(storage.getItem(keys.state)).toBe('LIVE')
    expect(storage.getItem(keys.verifier)).toBe('verifier-LIVE')
  })

  it('sweeps an expired flow while a concurrent live flow survives', () => {
    const { keys: stale } = seed('google', 'OLD', NOW - 1)
    const { storage, keys: live } = seed('google', 'LIVE', NOW + 60_000)

    sweepExpiredFlows(storage, 'google', NOW)

    expect(storage.getItem(stale.state)).toBeNull()
    expect(storage.getItem(live.state)).toBe('LIVE')
  })

  it('does not touch another provider', () => {
    const { keys: other } = seed('github', 'OLD', NOW - 1)
    const { storage } = seed('google', 'OLD', NOW - 1)

    sweepExpiredFlows(storage, 'google', NOW)

    expect(storage.getItem(other.state)).toBe('OLD')
  })

  it('is a no-op for a custom adapter that cannot enumerate keys', () => {
    const data = new Map<string, string>([['google.OLD.exp', '1']])
    const adapter = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    }

    expect(() => sweepExpiredFlows(adapter, 'google', NOW)).not.toThrow()
    expect(data.size).toBe(1)
  })
})
