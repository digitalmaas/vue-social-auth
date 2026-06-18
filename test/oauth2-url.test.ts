import { describe, expect, it, vi } from 'vitest'
import { OAuth2Runner } from '../src/oauth2'
import { createStorage } from '../src/storage'
import { parseQuery } from '../src/utils'

interface CapturedPopupArgs {
  url: string
}

vi.mock('../src/popup', () => {
  const captured: CapturedPopupArgs = { url: '' }
  class OAuthPopup {
    constructor(url: string) {
      captured.url = url
    }
    open() {
      return Promise.resolve({ code: 'AUTH_CODE', state: 'fixed-state' })
    }
  }
  return { OAuthPopup, __captured: captured }
})

import * as popupModule from '../src/popup'

describe('OAuth2Runner URL builder', () => {
  it('encodes default + required + optional params and joins scope', async () => {
    const storage = createStorage('memory')
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
    const captured = (popupModule as unknown as { __captured: CapturedPopupArgs }).__captured
    const [endpoint, query] = captured.url.split('?')
    expect(endpoint).toBe('https://example.test/authorize')
    const params = parseQuery(query!)
    expect(params.response_type).toBe('code')
    expect(params.client_id).toBe('CLIENT_ID')
    expect(params.redirect_uri).toBe('https://app.test/callback')
    expect(params.scope).toBe('user:email read:org')
    expect(params.state).toBe('fixed-state')
  })

  it('throws when popup state does not match stored state', async () => {
    vi.resetModules()
    vi.doMock('../src/popup', () => ({
      OAuthPopup: class {
        constructor() {}
        open() {
          return Promise.resolve({ code: 'X', state: 'tampered' })
        }
      },
    }))
    const { OAuth2Runner: Runner } = await import('../src/oauth2')
    const storage = createStorage('memory')
    const runner = new Runner(
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
  })
})
