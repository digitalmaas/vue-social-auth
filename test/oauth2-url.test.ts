import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StorageAdapter } from '../src/types'
import { parseQuery } from '../src/utils'

interface CapturedPopupArgs {
  url: string
}

let popupResponse: { code: string; state?: string } = { code: 'AUTH_CODE', state: 'fixed-state' }

vi.mock('../src/popup', () => {
  const captured: CapturedPopupArgs = { url: '' }
  class OAuthPopup {
    constructor(url: string) {
      captured.url = url
    }
    open() {
      return Promise.resolve(popupResponse)
    }
  }
  return { OAuthPopup, captured }
})

import { OAuth2Runner } from '../src/oauth2'
import * as popupModule from '../src/popup'

function makeStorage(): StorageAdapter {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

describe('OAuth2Runner', () => {
  beforeEach(() => {
    popupResponse = { code: 'AUTH_CODE', state: 'fixed-state' }
  })

  it('encodes default + required + optional params and joins scope', async () => {
    const storage = makeStorage()
    const runner = new OAuth2Runner(
      storage,
      {
        name: 'github',
        clientId: 'CLIENT_ID',
        authorizationEndpoint: 'https://example.test/authorize',
        redirectUri: 'https://app.test/callback',
        scope: ['user:email', 'read:org'],
        scopeDelimiter: ' ',
        state: 'fixed-state',
        defaultUrlParams: ['response_type', 'client_id', 'redirect_uri'],
        optionalUrlParams: ['scope', 'state'],
        responseType: 'code',
      },
      { withCredentials: false },
    )

    await runner.run()
    const { captured } = popupModule as unknown as { captured: CapturedPopupArgs }
    const [endpoint, query] = captured.url.split('?')
    expect(endpoint).toBe('https://example.test/authorize')
    const params = parseQuery(query!)
    expect(params.response_type).toBe('code')
    expect(params.client_id).toBe('CLIENT_ID')
    expect(params.redirect_uri).toBe('https://app.test/callback')
    expect(params.scope).toBe('user:email read:org')
    expect(params.state).toBe('fixed-state')
  })

  it('clears state from storage immediately after the popup resolves', async () => {
    const storage = makeStorage()
    const runner = new OAuth2Runner(
      storage,
      {
        name: 'p',
        clientId: 'cid',
        authorizationEndpoint: 'https://e.test/a',
        state: 'fixed-state',
        defaultUrlParams: ['response_type', 'client_id'],
        responseType: 'code',
      },
      { withCredentials: false },
    )
    await runner.run()
    expect(storage.getItem('p.state')).toBeNull()
    expect(storage.getItem('p.verifier')).toBeNull()
  })

  it('throws when the popup state does not match the stored state', async () => {
    popupResponse = { code: 'AUTH_CODE', state: 'tampered' }
    const storage = makeStorage()
    const runner = new OAuth2Runner(
      storage,
      {
        name: 'p',
        clientId: 'cid',
        authorizationEndpoint: 'https://e.test/a',
        state: 'expected-state',
        defaultUrlParams: ['response_type', 'client_id'],
        responseType: 'code',
      },
      { withCredentials: false },
    )
    await expect(runner.run()).rejects.toThrow(/state mismatch/i)
    expect(storage.getItem('p.state')).toBeNull()
  })

  it('throws when the stored state is missing (e.g. cross-tab tamper)', async () => {
    const data = new Map<string, string>()
    const droppingStorage: StorageAdapter = {
      getItem: (k) => data.get(k) ?? null,
      setItem: () => {
        /* drop writes: simulates storage cleared mid-flow */
      },
      removeItem: (k) => void data.delete(k),
    }
    const runner = new OAuth2Runner(
      droppingStorage,
      {
        name: 'p',
        clientId: 'cid',
        authorizationEndpoint: 'https://e.test/a',
        state: 'expected',
        defaultUrlParams: ['response_type', 'client_id'],
        responseType: 'code',
      },
      { withCredentials: false },
    )
    await expect(runner.run()).rejects.toThrow(/state missing/i)
  })
})
