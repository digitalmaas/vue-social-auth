import { describe, expect, it, vi } from 'vitest'

import {
  callbackEnvelope,
  deliverCallbackMessage,
  stubCrossOriginPopupOpen,
  useFakeClock,
} from './helpers'

/** Has the promise settled? Never awaits it, so an unsettled flow is safe. */
function settled(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    Promise.resolve().then(() => false),
  ])
}

/**
 * The `postMessage` channel, which is the only way a cross-origin callback can
 * return its result: the popup's `location` is unreadable, so the polling
 * fallback can never see it.
 *
 * The rejection cases each get their own test on purpose. They are the
 * security-critical assertions in the suite — bundling them would let one
 * passing check mask three broken ones.
 */
describe('integration: postMessage callback channel', () => {
  useFakeClock()

  const CALLBACK_ORIGIN = 'https://auth.example.test'

  function makeAuth() {
    return {
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          // deliberately a different origin from the app under test
          redirectUri: `${CALLBACK_ORIGIN}/callback`,
        },
      },
    }
  }

  /** Start a flow and return the popup handle plus the state it generated. */
  async function startFlow() {
    const { SocialAuth } = await import('../../src')
    const { popup, spy } = stubCrossOriginPopupOpen()
    const auth = new SocialAuth(makeAuth())

    const pending = auth.authenticate('mycorp')
    // let the listener register and the popup open
    await vi.advanceTimersByTimeAsync(10)

    const authorizeUrl = new URL((spy.mock.calls[0] as [string])[0])
    const state = authorizeUrl.searchParams.get('state')!
    expect(state).toBeTruthy()
    return { pending, popup, state, auth }
  }

  it('resolves from a cross-origin callback that posts its result', async () => {
    const { pending, popup, state } = await startFlow()

    deliverCallbackMessage({
      data: callbackEnvelope({ code: 'XORIGIN_CODE', state }),
      origin: CALLBACK_ORIGIN,
      source: popup,
    })

    await expect(pending).resolves.toMatchObject({ code: 'XORIGIN_CODE', state })
  })

  it('ignores a message from an unexpected origin', async () => {
    const { pending, popup, state } = await startFlow()

    deliverCallbackMessage({
      data: callbackEnvelope({ code: 'EVIL', state }),
      origin: 'https://evil.test',
      source: popup,
    })

    expect(await settled(pending)).toBe(false)
    pending.catch(() => undefined)
  })

  it('ignores a message from a window other than the popup it opened', async () => {
    const { pending, state } = await startFlow()

    deliverCallbackMessage({
      data: callbackEnvelope({ code: 'EVIL', state }),
      origin: CALLBACK_ORIGIN,
      source: { closed: false },
    })

    expect(await settled(pending)).toBe(false)
    pending.catch(() => undefined)
  })

  it('ignores a message that is not a library envelope', async () => {
    const { pending, popup, state } = await startFlow()

    deliverCallbackMessage({
      data: { params: { code: 'EVIL', state } },
      origin: CALLBACK_ORIGIN,
      source: popup,
    })

    expect(await settled(pending)).toBe(false)
    pending.catch(() => undefined)
  })

  it('ignores a message carrying the state of a different flow', async () => {
    const { pending, popup } = await startFlow()

    deliverCallbackMessage({
      data: callbackEnvelope({ code: 'OTHER_FLOW', state: 'some-other-flow-state' }),
      origin: CALLBACK_ORIGIN,
      source: popup,
    })

    expect(await settled(pending)).toBe(false)
    pending.catch(() => undefined)
  })

  it('stops listening once the flow has settled', async () => {
    const { pending, popup, state } = await startFlow()

    deliverCallbackMessage({
      data: callbackEnvelope({ code: 'FIRST', state }),
      origin: CALLBACK_ORIGIN,
      source: popup,
    })
    await expect(pending).resolves.toMatchObject({ code: 'FIRST' })

    // a second message must not throw or re-settle anything
    expect(() =>
      deliverCallbackMessage({
        data: callbackEnvelope({ code: 'SECOND', state }),
        origin: CALLBACK_ORIGIN,
        source: popup,
      }),
    ).not.toThrow()
  })
})
