import { describe, expect, it } from 'vitest'

import {
  drivePopupPoll,
  jsonResponse,
  stubFetch,
  stubPopupOpenEchoingState,
  useFakeClock,
} from './helpers'

/**
 * PKCE-only flow (no backend `url`): the runner must mint a `code_verifier`,
 * stash it in storage, then exchange it form-encoded at the provider's
 * `tokenEndpoint`. Uses the public `SocialAuth` class with the real popup
 * poll; only `window.open` and `fetch` are mocked.
 */
describe('integration: PKCE direct token-endpoint exchange', () => {
  useFakeClock()

  it('sends grant_type, code and a code_verifier to the tokenEndpoint', async () => {
    // import inside the test so happy-dom's crypto is ready for createPkcePair
    const { SocialAuth } = await import('../../src')

    const fetchMock = stubFetch(jsonResponse({ access_token: 'AT' }))
    stubPopupOpenEchoingState('https://app.test/callback', { code: 'PKCE_CODE' })

    const auth = new SocialAuth({
      providers: {
        x: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          redirectUri: 'https://app.test/callback',
          tokenEndpoint: 'https://provider.test/token',
          pkce: true,
        },
      },
    })

    const pending = auth.authenticate('x')
    await drivePopupPoll()
    const result = await pending

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://provider.test/token')
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    const body = opts.body as string
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('code=PKCE_CODE')
    expect(body).toContain('client_id=CID')
    expect(body).toMatch(/code_verifier=[^&]+/)
    expect(result).toEqual({ access_token: 'AT' })

    // verifier must be cleared from storage after the exchange
    expect(auth.storage.getItem('x.verifier')).toBeNull()
    expect(auth.storage.getItem('x.state')).toBeNull()
  })
})
