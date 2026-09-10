import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StorageAdapter } from '../../src/types'

let popupResponse: { code: string; state?: string } = { code: 'AUTH_CODE', state: 'S' }

vi.mock('../../src/popup', () => {
  class OAuthPopup {
    open() {
      return Promise.resolve(popupResponse)
    }
    navigate() {}
    cancel() {}
  }
  return { OAuthPopup, CALLBACK_MESSAGE_SOURCE: 'vue-social-auth' }
})

const { OAuth2Runner } = await import('../../src/oauth2')

/** Storage adapter that also lets a test see everything still held. */
function makeStorage() {
  const data = new Map<string, string>()
  const adapter: StorageAdapter & { entries: () => string[] } = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    entries: () => [...data.keys()],
  }
  return adapter
}

function runner(storage: StorageAdapter, config: Record<string, unknown> = {}) {
  return new OAuth2Runner(
    storage,
    {
      name: 'p',
      clientId: 'cid',
      authorizationEndpoint: 'https://e.test/a',
      state: () => 'S',
      responseType: 'code',
      ...config,
    } as never,
    { withCredentials: false },
  )
}

/**
 * State verification and storage hygiene in the flow runner. The authorization
 * URL is covered separately by the `buildAuthorizationQuery` unit tests.
 */
describe('OAuth2Runner', () => {
  beforeEach(() => {
    popupResponse = { code: 'AUTH_CODE', state: 'S' }
  })

  it('leaves nothing in storage after a successful flow', async () => {
    const storage = makeStorage()
    await runner(storage).run()
    expect(storage.entries()).toEqual([])
  })

  it('rejects when the returned state does not match, and clears storage', async () => {
    popupResponse = { code: 'AUTH_CODE', state: 'tampered' }
    const storage = makeStorage()

    await expect(runner(storage).run()).rejects.toMatchObject({ code: 'state_mismatch' })
    expect(storage.entries()).toEqual([])
  })

  it('rejects when the stored state has vanished mid-flow', async () => {
    const data = new Map<string, string>()
    const droppingStorage: StorageAdapter = {
      getItem: (k) => data.get(k) ?? null,
      setItem: () => {
        /* drop writes: simulates storage cleared mid-flow */
      },
      removeItem: (k) => void data.delete(k),
    }

    await expect(runner(droppingStorage).run()).rejects.toMatchObject({ code: 'state_missing' })
  })

  it('scopes storage keys per flow so concurrent runs cannot collide', async () => {
    const storage = makeStorage()
    const seen: string[] = []
    const spy: StorageAdapter = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        seen.push(k)
        storage.setItem(k, v)
      },
      removeItem: (k) => storage.removeItem(k),
    }

    popupResponse = { code: 'AUTH_CODE', state: 'STATE_A' }
    await runner(spy, { state: () => 'STATE_A' }).run()
    expect(seen.some((key) => key.includes('STATE_A'))).toBe(true)
  })
})
