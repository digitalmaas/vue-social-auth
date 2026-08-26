import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  callbackEnvelope,
  deliverCallbackMessage,
  stubCrossOriginPopupOpen,
  stubPopupOpenEchoingState,
} from './helpers'

/**
 * Every way a popup flow can end must settle the promise, release the poll
 * interval and the message listener, and leave nothing in storage.
 *
 * The review found the flow could hang forever: for a cross-origin callback
 * the location read throws on every tick, so the promise never settled and the
 * interval polled for the life of the tab.
 */
describe('integration: popup lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const CALLBACK_ORIGIN = 'https://auth.example.test'

  function providers(extra: Record<string, unknown> = {}) {
    return {
      mycorp: {
        clientId: 'CID',
        authorizationEndpoint: 'https://provider.test/auth',
        redirectUri: `${CALLBACK_ORIGIN}/callback`,
        ...extra,
      },
    }
  }

  it('times out instead of polling forever when no result ever arrives', async () => {
    const { SocialAuth } = await import('../../src')
    stubCrossOriginPopupOpen()

    const auth = new SocialAuth({ providers: providers({ popupTimeoutMs: 60_000 }) })
    const pending = auth.authenticate('mycorp')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })

    await vi.advanceTimersByTimeAsync(60_001)
    await assertion
  })

  it('clears stored state and verifier when the flow times out', async () => {
    const { SocialAuth } = await import('../../src')
    stubCrossOriginPopupOpen()

    const auth = new SocialAuth({
      providers: providers({ popupTimeoutMs: 60_000, pkce: true, tokenEndpoint: 'https://t.test' }),
    })
    const pending = auth.authenticate('mycorp')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(60_001)
    await assertion

    expect(window.sessionStorage.length).toBe(0)
  })

  it('stops the poll interval after the flow times out', async () => {
    const { SocialAuth } = await import('../../src')
    stubCrossOriginPopupOpen()
    const clearInterval = vi.spyOn(window, 'clearInterval')

    const auth = new SocialAuth({ providers: providers({ popupTimeoutMs: 60_000 }) })
    const pending = auth.authenticate('mycorp')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(60_001)
    await assertion

    expect(clearInterval).toHaveBeenCalled()
    // nothing further should be scheduled
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with popup_closed when the user closes the window', async () => {
    const { SocialAuth } = await import('../../src')
    const { popup } = stubCrossOriginPopupOpen()

    const auth = new SocialAuth({ providers: providers() })
    const pending = auth.authenticate('mycorp')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'popup_closed' })

    await vi.advanceTimersByTimeAsync(10)
    popup.closed = true
    await vi.advanceTimersByTimeAsync(300)
    await assertion

    expect(window.sessionStorage.length).toBe(0)
  })

  it('rejects with popup_blocked when the popup does not open', async () => {
    const { SocialAuth } = await import('../../src')
    vi.spyOn(window, 'open').mockImplementation(() => null)

    const auth = new SocialAuth({ providers: providers() })
    await expect(auth.authenticate('mycorp')).rejects.toMatchObject({ code: 'popup_blocked' })
    expect(window.sessionStorage.length).toBe(0)
  })

  it('settles exactly once when both channels deliver a result', async () => {
    const { SocialAuth } = await import('../../src')
    // same-origin popup: the poll channel can read it, and we also post a message
    const open = stubPopupOpenEchoingState(`${location.origin}/callback`, { code: 'POLLED' })

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          redirectUri: '/callback',
        },
      },
    })
    const pending = auth.authenticate('mycorp')
    await vi.advanceTimersByTimeAsync(10)

    const state = new URL((open.mock.calls[0] as [string])[0]).searchParams.get('state')!
    deliverCallbackMessage({
      data: callbackEnvelope({ code: 'POSTED', state }),
      origin: location.origin,
      source: open.mock.results[0]!.value,
    })

    await vi.advanceTimersByTimeAsync(300)
    const result = (await pending) as { code: string }

    // whichever won, exactly one result comes back and no timers survive
    expect(['POLLED', 'POSTED']).toContain(result.code)
    expect(vi.getTimerCount()).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('ignores a URL fragment: an implicit-flow token is never a result', async () => {
    const { SocialAuth } = await import('../../src')
    stubPopupOpenEchoingState(`${location.origin}/callback#access_token=LEAKED&token_type=bearer`, {
      code: 'CODE',
    })

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          redirectUri: '/callback',
        },
      },
    })
    const pending = auth.authenticate('mycorp')
    await vi.advanceTimersByTimeAsync(300)
    const result = (await pending) as Record<string, unknown>

    expect(result.code).toBe('CODE')
    expect(result.access_token).toBeUndefined()
  })
})
