import { describe, expect, it } from 'vitest'

import {
  drivePopupPoll,
  navigatedUrl,
  stubPopupOpen,
  useFakeClock,
  waitForPopupOpen,
} from './helpers'

async function authorizeUrlFor(config: Record<string, unknown>): Promise<URL> {
  const { SocialAuth } = await import('../../src')
  const open = stubPopupOpen('https://app.test/cb?code=C&state=ignored')
  const auth = new SocialAuth({
    providers: {
      mycorp: {
        clientId: 'CID',
        authorizationEndpoint: 'https://provider.test/auth',
        redirectUri: 'https://app.test/cb',
        ...config,
      },
    },
  })
  const pending = auth.authenticate('mycorp').catch(() => undefined)
  await waitForPopupOpen(open)
  const url = navigatedUrl(open)
  await drivePopupPoll()
  await pending
  return url
}

/**
 * PKCE defaults on for the direct token-endpoint flow, where the browser IS
 * the OAuth client and therefore a public client
 * (draft-ietf-oauth-browser-based-apps).
 *
 * It stays off by default for the backend-exchange flow, because enabling it
 * there changes a contract the library does not own: the backend has to
 * forward `codeVerifier` to the provider, and one that does not would start
 * failing with `invalid_grant`.
 */
describe('integration: PKCE default', () => {
  useFakeClock()

  it('enables PKCE for a token-endpoint provider without being asked', async () => {
    const url = await authorizeUrlFor({ tokenEndpoint: 'https://provider.test/token' })

    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('leaves PKCE off for a backend-exchange provider', async () => {
    const url = await authorizeUrlFor({ url: '/api/auth/mycorp' })

    expect(url.searchParams.get('code_challenge')).toBeNull()
  })

  it('leaves PKCE off when neither exchange endpoint is configured', async () => {
    const url = await authorizeUrlFor({})

    expect(url.searchParams.get('code_challenge')).toBeNull()
  })

  it('honours an explicit opt-out on a token-endpoint provider', async () => {
    const url = await authorizeUrlFor({
      tokenEndpoint: 'https://provider.test/token',
      pkce: false,
    })

    expect(url.searchParams.get('code_challenge')).toBeNull()
  })

  it('honours an explicit opt-in on a backend-exchange provider', async () => {
    const url = await authorizeUrlFor({ url: '/api/auth/mycorp', pkce: true })

    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('does not enable PKCE when a backend url is set alongside a tokenEndpoint', async () => {
    // `url` wins the flow selection, so the browser is not the client here
    const url = await authorizeUrlFor({
      url: '/api/auth/mycorp',
      tokenEndpoint: 'https://provider.test/token',
    })

    expect(url.searchParams.get('code_challenge')).toBeNull()
  })
})
