import { CALLBACK_MESSAGE_SOURCE } from './popup'
import type { CallbackMessage } from './popup'
import { parseQuery } from './utils'

/**
 * Options for {@link postAuthorizationResult}.
 *
 * @public
 */
export interface PostAuthorizationResultOptions {
  /**
   * Origin of the application window that opened this popup, e.g.
   * `'https://app.example.com'`.
   *
   * This is required and must be exact. It is passed straight to
   * `postMessage` as the target origin, and the payload contains the
   * authorization code — posting to `'*'` would hand that code to whatever
   * origin happens to own the opener. The library cannot infer the value,
   * because only you know which app origin is legitimate.
   */
  targetOrigin: string
  /**
   * Close the popup after posting.
   * @defaultValue `true`
   */
  close?: boolean
}

/**
 * Relay this page's OAuth query parameters to the application window that
 * opened it, then close.
 *
 * Call this from the page you host at your provider's redirect URI. It is the
 * only thing that page needs to do, and it is required when the callback URI
 * is on a different origin from your app — the library cannot read a
 * cross-origin popup's URL, so `postMessage` is the only way the result can
 * get back.
 *
 * When your callback URI is same-origin with your app you do not need this:
 * the library falls back to reading the popup's location directly.
 *
 * @example
 * ```html
 * <!-- https://auth.example.com/callback -->
 * <script type="module">
 *   import { postAuthorizationResult } from '@digitalmaas/vue-social-auth/callback'
 *   postAuthorizationResult({ targetOrigin: 'https://app.example.com' })
 * </script>
 * ```
 *
 * @public
 */
export function postAuthorizationResult(options: PostAuthorizationResultOptions): void {
  if (typeof window === 'undefined') return

  const opener = window.opener as Window | null
  if (!opener) {
    throw new Error(
      '[vue-social-auth] postAuthorizationResult: this page has no opener. ' +
        'It is meant to run in the popup opened by authenticate().',
    )
  }

  const message: CallbackMessage = {
    source: CALLBACK_MESSAGE_SOURCE,
    params: parseQuery(window.location.search),
  }
  opener.postMessage(message, options.targetOrigin)

  if (options.close !== false) window.close()
}
