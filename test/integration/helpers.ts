import { vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue-demi'

import type { SocialAuthPlugin } from '../../src'

/**
 * Fake popup Window driven to a fixed redirect URL. `popup.ts` polls
 * `location.{href,search,hash,pathname}` and matches against the provider's
 * `redirectUri`, so those four fields are all the poll loop reads.
 */
export function fakePopup(redirectHref: string) {
  const u = new URL(redirectHref)
  return {
    closed: false,
    focus() {},
    close() {
      this.closed = true
    },
    location: {
      href: redirectHref,
      search: u.search,
      hash: u.hash,
      pathname: u.pathname,
    },
  }
}

/**
 * Fake popup whose `location` throws on access, as a real cross-origin popup
 * does. The polling channel can learn nothing from this window, so a flow that
 * completes against it completed via `postMessage`.
 */
export function fakeCrossOriginPopup() {
  return {
    closed: false,
    focus() {},
    close() {
      this.closed = true
    },
    get location(): never {
      throw new DOMException('Blocked a frame from accessing a cross-origin frame.')
    },
  }
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

/** The envelope `postAuthorizationResult` puts on the wire. */
export function callbackEnvelope(params: Record<string, string>) {
  return { source: 'vue-social-auth', params }
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
  return vi.spyOn(window, 'open').mockImplementation((...args: unknown[]) => {
    const authorizeUrl = new URL(String(args[0]))
    const redirect = new URL(redirectBase)
    redirect.searchParams.set('state', authorizeUrl.searchParams.get('state') ?? '')
    for (const [key, value] of Object.entries(extraParams)) {
      redirect.searchParams.set(key, value)
    }
    return fakePopup(redirect.href) as unknown as Window
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
