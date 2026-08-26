import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SocialAuth } from '../../src'
import { jsonResponse, stubFetch, stubPopupOpen, stubPopupOpenEchoingState } from './helpers'

function makeAuth(overrides = {}) {
  return new SocialAuth({
    providers: {
      x: {
        clientId: 'CID',
        authorizationEndpoint: 'https://provider.test/auth',
        redirectUri: 'https://app.test/callback',
        url: '/api/auth/x',
        ...overrides,
      },
    },
  })
}

describe('integration: error propagation end-to-end', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects when the popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const fetchMock = stubFetch(jsonResponse({}))

    await expect(makeAuth().authenticate('x')).rejects.toThrow(/popup was blocked/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects on state mismatch (CSRF) and never reaches the exchange', async () => {
    stubPopupOpen('https://app.test/callback?code=C&state=tampered')
    const fetchMock = stubFetch(jsonResponse({}))

    // the popup echoes a state the library never generated
    const pending = makeAuth().authenticate('x')
    const assertion = expect(pending).rejects.toThrow(/state mismatch/i)
    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects when the backend exchange returns a non-2xx response', async () => {
    stubPopupOpenEchoingState('https://app.test/callback', { code: 'C' })
    stubFetch(jsonResponse({ message: 'nope' }, 500))

    const pending = makeAuth().authenticate('x')
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'exchange_failed',
      status: 500,
    })
    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
    await assertion
  })

  it('rejects synchronously for an unknown provider', async () => {
    await expect(makeAuth().authenticate('does-not-exist')).rejects.toThrow(
      /Unknown OAuth provider/i,
    )
  })

  it('exposes the provider error as structured fields, not as message text', async () => {
    stubPopupOpen(
      'https://app.test/callback?error=access_denied&error_description=%3Cimg%20onerror%3Dalert(1)%3E',
    )
    const fetchMock = stubFetch(jsonResponse({}))

    const pending = makeAuth().authenticate('x')
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'provider_error',
      providerError: 'access_denied',
      providerErrorDescription: '<img onerror=alert(1)>',
    })
    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).not.toHaveBeenCalled()

    // the attacker-influenced description must stay out of `message`, which
    // apps commonly render directly
    await expect(pending).rejects.toThrow(/^The provider rejected the authorization$/)
  })
})
