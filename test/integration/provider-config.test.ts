import { describe, expect, it, vi } from 'vitest'

import { navigatedUrl, stubPopupOpen, useFakeClock } from './helpers'

/**
 * Provider-configuration resolution, observed at the only place it is
 * externally visible: the authorization URL the popup is opened with.
 *
 * The review found that a custom (non-preset) provider key never received a
 * `state` parameter, because only the shipped presets listed `state` in their
 * optional URL params. The flow then failed state verification on the way
 * back, reporting a CSRF error for what was a library defaulting bug.
 */
/** Read the authorization URL the popup was navigated to. */
function authorizeUrl(spy: ReturnType<typeof stubPopupOpen>): URL {
  expect(spy).toHaveBeenCalled()
  return navigatedUrl(spy)
}

describe('integration: provider config resolution', () => {
  useFakeClock()

  it('sends state for a custom provider key with no preset behind it', async () => {
    const { SocialAuth } = await import('../../src')
    const open = stubPopupOpen('https://app.test/callback?code=C&state=ignored')

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          redirectUri: 'https://app.test/callback',
        },
      },
    })

    const pending = auth.authenticate('mycorp').catch(() => undefined)
    await vi.runAllTimersAsync()
    await pending

    expect(authorizeUrl(open).searchParams.get('state')).toBeTruthy()
  })

  it('sends state for a preset provider', async () => {
    const { SocialAuth } = await import('../../src')
    const open = stubPopupOpen('https://app.test/?code=C&state=ignored')

    const auth = new SocialAuth({ providers: { google: { clientId: 'CID' } } })
    const pending = auth.authenticate('google').catch(() => undefined)
    await vi.runAllTimersAsync()
    await pending

    expect(authorizeUrl(open).searchParams.get('state')).toBeTruthy()
  })

  it('resolves a relative redirectUri against the current origin at call time', async () => {
    const { SocialAuth } = await import('../../src')
    const open = stubPopupOpen('https://app.test/cb?code=C&state=ignored')

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          redirectUri: '/cb',
        },
      },
    })

    const pending = auth.authenticate('mycorp').catch(() => undefined)
    await vi.runAllTimersAsync()
    await pending

    expect(authorizeUrl(open).searchParams.get('redirect_uri')).toBe(`${location.origin}/cb`)
  })

  it('defaults redirectUri to the current origin when none is configured', async () => {
    const { SocialAuth } = await import('../../src')
    const open = stubPopupOpen('https://app.test/?code=C&state=ignored')

    const auth = new SocialAuth({
      providers: {
        mycorp: { clientId: 'CID', authorizationEndpoint: 'https://provider.test/auth' },
      },
    })

    const pending = auth.authenticate('mycorp').catch(() => undefined)
    await vi.runAllTimersAsync()
    await pending

    expect(authorizeUrl(open).searchParams.get('redirect_uri')).toBe(location.origin)
  })

  it('still sends state when the config empties every URL param category', async () => {
    const { SocialAuth } = await import('../../src')
    const open = stubPopupOpen('https://app.test/?code=C&state=ignored')

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          defaultUrlParams: [],
          optionalUrlParams: [],
          requiredUrlParams: [],
        },
      },
    })

    const pending = auth.authenticate('mycorp').catch(() => undefined)
    await vi.runAllTimersAsync()
    await pending

    // state is an invariant of the flow, not a configurable parameter: the
    // library always verifies it on the way back, so it must always be sent.
    expect(authorizeUrl(open).searchParams.get('state')).toBeTruthy()
  })

  it('does not emit a duplicate state param when a category also lists it', async () => {
    const { SocialAuth } = await import('../../src')
    const open = stubPopupOpen('https://app.test/?code=C&state=ignored')

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          optionalUrlParams: ['state'],
        },
      },
    })

    const pending = auth.authenticate('mycorp').catch(() => undefined)
    await vi.runAllTimersAsync()
    await pending

    expect(authorizeUrl(open).searchParams.getAll('state')).toHaveLength(1)
  })

  it('rejects a pkce provider that has nowhere to redeem the verifier', async () => {
    const { SocialAuth } = await import('../../src')
    const open = stubPopupOpen('https://app.test/?code=C&state=ignored')

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          pkce: true,
          // neither `url` nor `tokenEndpoint`
        },
      },
    })

    await expect(auth.authenticate('mycorp')).rejects.toMatchObject({ code: 'config' })
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects a constant state at runtime, not just in the type system', async () => {
    const { SocialAuth } = await import('../../src')
    const open = stubPopupOpen('https://app.test/?code=C&state=fixed')

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          // a plain JS caller has no type system to stop them
          state: 'fixed' as unknown as () => string,
        },
      },
    })

    await expect(auth.authenticate('mycorp')).rejects.toMatchObject({ code: 'config' })
    expect(open).not.toHaveBeenCalled()
  })

  it('reports an unknown provider as a config error', async () => {
    const { SocialAuth } = await import('../../src')
    const auth = new SocialAuth({})
    await expect(auth.authenticate('nope')).rejects.toMatchObject({ code: 'config' })
  })
})
