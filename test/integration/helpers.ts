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

/** Stub `window.open` to land on `redirectHref`. Returns the spy. */
export function stubPopupOpen(redirectHref: string) {
  return vi
    .spyOn(window, 'open')
    .mockImplementation(() => fakePopup(redirectHref) as unknown as Window)
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
