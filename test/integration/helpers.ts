import { afterEach, beforeEach, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue-demi'

import type { SocialAuthPlugin } from '../../src'
import { postAuthorizationResult } from '../../src/callback'

/**
 * Fake timers plus the teardown every popup spec needs: the poll loop is
 * driven by `setInterval`, and mocks/globals must be restored between tests or
 * a stubbed `window.open` leaks into the next one.
 *
 * Call once at the top of a `describe`.
 */
export function useFakeClock(): void {
  beforeEach(() => {
    vi.useFakeTimers()
    window.sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
}

/**
 * Yield until the popup has been navigated to its authorization URL.
 *
 * The window itself opens synchronously (on `about:blank`), but a flow does
 * asynchronous work before navigating it (PKCE calls `crypto.subtle`), so
 * advancing the clock immediately can jump past a deadline that was never
 * armed. Waiting on the observable event instead of a fixed delay keeps such
 * tests from depending on file order.
 */
export async function waitForPopupOpen(spy: {
  mock: { results: { value: unknown }[] }
}): Promise<void> {
  const navigated = () =>
    Boolean((spy.mock.results[0]?.value as { navigatedUrl?: string } | undefined)?.navigatedUrl)
  for (let i = 0; i < 100 && !navigated(); i++) {
    // Sequential by design: each tick must be observed before deciding whether
    // to advance again. Promise.all would defeat the purpose.
    // eslint-disable-next-line no-await-in-loop
    await vi.advanceTimersByTimeAsync(1)
  }
  if (!navigated()) throw new Error('popup was never navigated')
}

/** The authorization URL the library navigated the first stubbed popup to. */
export function navigatedUrl(spy: { mock: { results: { value: unknown }[] } }): URL {
  const popup = spy.mock.results[0]?.value as { navigatedUrl?: string } | undefined
  if (!popup?.navigatedUrl) throw new Error('popup was never navigated')
  return new URL(popup.navigatedUrl)
}

/**
 * Drive the popup poll far enough to deliver a same-origin result, then let
 * any follow-on microtasks (the token exchange) settle.
 */
export async function drivePopupPoll(): Promise<void> {
  await vi.advanceTimersByTimeAsync(300)
  await vi.runAllTimersAsync()
}

/**
 * Fake popup Window. It starts on `about:blank`, as the real flow's popup
 * does (the window must open synchronously inside the user's click);
 * `location.replace` models the provider redirect by landing straight on
 * `redirectHref`. `popup.ts` polls `location.{href,search,hash,pathname}`,
 * so those four fields are all the poll loop reads.
 */
export function fakePopup(redirectHref: string) {
  const u = new URL(redirectHref)
  const popup = {
    closed: false,
    /** The authorization URL the library navigated this popup to. */
    navigatedUrl: undefined as string | undefined,
    focus() {},
    close() {
      popup.closed = true
    },
    location: {
      href: 'about:blank',
      search: '',
      hash: '',
      pathname: '',
      replace(url: string) {
        popup.navigatedUrl = url
        popup.location.href = redirectHref
        popup.location.search = u.search
        popup.location.hash = u.hash
        popup.location.pathname = u.pathname
      },
    },
  }
  return popup
}

/**
 * Fake popup whose `location` throws on access once navigated, as a real
 * cross-origin popup does. The polling channel can learn nothing from this
 * window, so a flow that completes against it completed via `postMessage`.
 */
export function fakeCrossOriginPopup() {
  const blankLocation = {
    href: 'about:blank',
    search: '',
    hash: '',
    pathname: '',
    replace(url: string) {
      popup.navigatedUrl = url
    },
  }
  const popup = {
    closed: false,
    /** The authorization URL the library navigated this popup to. */
    navigatedUrl: undefined as string | undefined,
    focus() {},
    close() {
      popup.closed = true
    },
    get location() {
      // Readable while still on about:blank (same-origin), unreadable once
      // navigated to the provider — exactly a real cross-origin popup.
      if (popup.navigatedUrl === undefined) return blankLocation
      throw new DOMException('Blocked a frame from accessing a cross-origin frame.')
    },
  }
  return popup
}

/** Stub `window.open` to return a popup whose location is unreadable. */
export function stubCrossOriginPopupOpen() {
  const popup = fakeCrossOriginPopup()
  const spy = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window)
  return { popup, spy }
}

/**
 * Deliver a `message` event to the parent window, exactly as a callback page
 * calling `postAuthorizationResult` would. Every field is overridable so the
 * rejection paths (wrong origin, wrong source, bad envelope) can be driven.
 */
export function deliverCallbackMessage(options: {
  data: unknown
  origin: string
  source: unknown
}): void {
  const event = new MessageEvent('message', { data: options.data, origin: options.origin })
  // happy-dom will not accept an arbitrary object as `source` via the
  // constructor, so pin it directly.
  Object.defineProperty(event, 'source', { value: options.source, configurable: true })
  window.dispatchEvent(event)
}

function search(value: string): string {
  if (!value) return ''
  return value.startsWith('?') ? value : `?${value}`
}

/**
 * Run `body` with `window.opener`, `window.location.search` and `window.close`
 * standing in for a callback page, restoring them afterwards.
 *
 * Pass an `opener` that records what it receives to inspect the posted
 * message; `closed` reports whether the page closed itself.
 */
export function withStubbedCallbackWindow<T>(
  options: { search: string; opener: unknown },
  body: () => T,
): { result: T; closed: boolean } {
  let closed = false

  const realOpener = Object.getOwnPropertyDescriptor(window, 'opener')
  const realSearch = window.location.search
  const realClose = window.close

  Object.defineProperty(window, 'opener', { value: options.opener, configurable: true })
  window.history.replaceState(null, '', `${window.location.pathname}${search(options.search)}`)
  window.close = () => void (closed = true)

  try {
    const result = body()
    return { result, closed }
  } finally {
    if (realOpener) Object.defineProperty(window, 'opener', realOpener)
    else Object.defineProperty(window, 'opener', { value: null, configurable: true })
    window.history.replaceState(null, '', `${window.location.pathname}${realSearch}`)
    window.close = realClose
  }
}

/**
 * The envelope `postAuthorizationResult` puts on the wire — produced by the
 * real callback helper rather than hand-written, so the two halves of the
 * protocol cannot drift apart.
 */
export function callbackEnvelope(params: Record<string, string>) {
  let captured: unknown
  const opener = { postMessage: (message: unknown) => void (captured = message) }

  withStubbedCallbackWindow({ search: new URLSearchParams(params).toString(), opener }, () =>
    postAuthorizationResult({ targetOrigin: 'https://parent.test' }),
  )
  return captured
}

/** Stub `window.open` to land on `redirectHref`. Returns the spy. */
export function stubPopupOpen(redirectHref: string) {
  return vi
    .spyOn(window, 'open')
    .mockImplementation(() => fakePopup(redirectHref) as unknown as Window)
}

/**
 * Stub `window.open` to land on `redirectBase`, echoing back the `state` the
 * library actually generated for this flow.
 *
 * Prefer this over hard-coding a state value: pinning `state` to a constant is
 * exactly the footgun the library now rejects, and echoing it here means the
 * real CSPRNG generation path runs in every test that completes a flow.
 */
export function stubPopupOpenEchoingState(
  redirectBase: string,
  extraParams: Record<string, string> = {},
) {
  return vi.spyOn(window, 'open').mockImplementation(() => {
    const popup = {
      closed: false,
      /** The authorization URL the library navigated this popup to. */
      navigatedUrl: undefined as string | undefined,
      focus() {},
      close() {
        popup.closed = true
      },
      location: {
        href: 'about:blank',
        search: '',
        hash: '',
        pathname: '',
        replace(url: string) {
          popup.navigatedUrl = url
          const redirect = new URL(redirectBase)
          redirect.searchParams.set('state', new URL(url).searchParams.get('state') ?? '')
          for (const [key, value] of Object.entries(extraParams)) {
            redirect.searchParams.set(key, value)
          }
          popup.location.href = redirect.href
          popup.location.search = redirect.search
          popup.location.hash = redirect.hash
          popup.location.pathname = redirect.pathname
        },
      },
    }
    return popup as unknown as Window
  })
}

/** A real `Response` so `oauth2.ts#readJson` exercises its content-type branch. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Install a mocked global `fetch` resolving to `response`. Returns the mock. */
export function stubFetch(response: Response) {
  const mock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', mock)
  return mock
}

/**
 * Mount a component with the plugin installed. Uses `vue-demi`'s `createApp`,
 * which is native on Vue 3 and polyfilled on Vue 2.7, so the SAME spec runs
 * under both — the active version follows `vue-demi-switch` (see the notes in
 * cross-version.test.ts).
 */
export function mountWithPlugin(setup: () => unknown, plugin: SocialAuthPlugin): void {
  const Comp = defineComponent({ setup, render: () => h('div') })
  // Don't chain: vue-demi's Vue 2.7 `createApp` polyfill returns the Vue ctor
  // from `app.use` (it's `Vue.use.bind(Vue)`), not the app — so `.mount` would
  // be undefined. Call each on the app explicitly. Use before mount so the
  // plugin is installed when the component's setup() runs.
  const app = createApp(Comp)
  app.use(plugin)
  app.mount(document.createElement('div'))
}
