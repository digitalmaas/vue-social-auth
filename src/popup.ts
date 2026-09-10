import { SocialAuthError } from './errors'
import type { AuthorizationResponse, PopupOptions } from './types'
import { parseQuery } from './utils'

const POLL_INTERVAL_MS = 250
/**
 * A callback page posts its result and then closes itself; the message task
 * can still be queued behind the tick that observes the close. One grace
 * period lets a pending result win before the close is treated as the user
 * abandoning the flow.
 */
const CLOSE_GRACE_MS = 500

/** Discriminator on the envelope a callback page posts back. */
export const CALLBACK_MESSAGE_SOURCE = 'vue-social-auth'

/** Envelope posted by {@link postAuthorizationResult} on the callback page. */
export interface CallbackMessage {
  source: typeof CALLBACK_MESSAGE_SOURCE
  params: Record<string, string>
}

interface PopupGeometry {
  width: number
  height: number
  left: number
  top: number
}

export interface OpenOptions {
  /** Resolved absolute redirect URI; its origin is the only accepted sender. */
  redirectUri: string
  /** The `state` this flow sent, used to match results to this flow. */
  expectedState: string
  /** Milliseconds before the flow gives up. */
  timeoutMs: number
}

function computeGeometry(opts: PopupOptions): PopupGeometry {
  const width = opts.width ?? 500
  const height = opts.height ?? 600
  const screen = typeof window === 'undefined' ? undefined : window.screen
  const sw = screen?.width ?? width
  const sh = screen?.height ?? height
  return {
    width,
    height,
    left: Math.max(0, Math.round(sw / 2 - width / 2)),
    top: Math.max(0, Math.round(sh / 2 - height / 2)),
  }
}

function formatFeatures(g: PopupGeometry): string {
  return [
    `width=${g.width}`,
    `height=${g.height}`,
    `top=${g.top}`,
    `left=${g.left}`,
    'scrollbars=yes',
    'resizable=yes',
  ].join(',')
}

function isCallbackMessage(data: unknown): data is CallbackMessage {
  if (typeof data !== 'object' || data === null) return false
  const candidate = data as Partial<CallbackMessage>
  if (candidate.source !== CALLBACK_MESSAGE_SOURCE) return false
  // `typeof null === 'object'`, and an array would read `.state` as undefined:
  // both must be rejected here or the listener throws on the next line.
  const params: unknown = candidate.params
  return typeof params === 'object' && params !== null && !Array.isArray(params)
}

/**
 * Opens the authorization popup and waits for the redirect result.
 *
 * The window opens on `about:blank` and is navigated to the authorization URL
 * afterwards via {@link navigate}. `window.open` must run synchronously inside
 * the user's click — Safari does not preserve transient activation across an
 * awaited promise, so a flow that awaits (e.g. PKCE's `crypto.subtle`) before
 * opening would be blocked on a legitimate click.
 *
 * Two channels are armed for every flow and race each other:
 *
 * 1. `postMessage` from a callback page (see `postAuthorizationResult`). This
 *    is the only channel that works when the callback is on a different origin
 *    from the app, because the popup's `location` is then unreadable.
 * 2. Polling the popup's `location`, which works only same-origin. Kept so
 *    that apps with a same-origin callback need no callback page.
 *
 * Whichever produces a result first settles the flow; both are torn down
 * together, along with the timeout.
 */
export class OAuthPopup {
  private popup: Window | null = null
  private abort: ((err: Error) => void) | null = null

  constructor(
    private readonly name: string,
    private readonly options: PopupOptions = {},
  ) {}

  open(options: OpenOptions): Promise<AuthorizationResponse> {
    if (typeof window === 'undefined') {
      return Promise.reject(
        new SocialAuthError('config', 'OAuth popup requires a browser environment'),
      )
    }

    const redirect = new URL(options.redirectUri, window.location.origin)
    const expectedOrigin = redirect.origin
    const redirectPath = redirect.pathname

    return new Promise<AuthorizationResponse>((resolve, reject) => {
      let done = false
      let timer: number | undefined
      let deadline: number | undefined
      let grace: number | undefined

      const cleanup = (): void => {
        if (timer !== undefined) window.clearInterval(timer)
        if (deadline !== undefined) window.clearTimeout(deadline)
        if (grace !== undefined) window.clearTimeout(grace)
        window.removeEventListener('message', onMessage)
        timer = undefined
        deadline = undefined
        grace = undefined
      }

      const settle = (fn: () => void): void => {
        if (done) return
        done = true
        cleanup()
        try {
          this.popup?.close()
        } catch {
          /* already gone */
        }
        this.popup = null
        fn()
      }

      this.abort = (err: Error): void => {
        settle(() => reject(err))
      }

      const succeed = (params: Record<string, string>): void => {
        if (params.error) {
          settle(() =>
            reject(
              new SocialAuthError('provider_error', 'The provider rejected the authorization', {
                providerError: params.error,
                providerErrorDescription: params.error_description,
              }),
            ),
          )
          return
        }
        settle(() => resolve(params as AuthorizationResponse))
      }

      // Registered BEFORE window.open so a fast callback cannot post into a
      // window that is not listening yet.
      const onMessage = (event: MessageEvent): void => {
        if (done) return
        // Every check below is a silent ignore, not a rejection: unrelated
        // postMessage traffic is normal, and so is a message belonging to a
        // different concurrent flow.
        if (event.source !== this.popup) return
        if (event.origin !== expectedOrigin) return
        if (!isCallbackMessage(event.data)) return

        const params = event.data.params
        // A provider that rejects the request may redirect back without
        // echoing `state`. Source and origin already pin this message to the
        // window we opened, so accept it rather than letting a denial sit
        // until the timeout fires. Success still requires a state match.
        const isUnstatedError = params.state === undefined && params.error !== undefined
        if (!isUnstatedError && params.state !== options.expectedState) return

        succeed(params)
      }
      window.addEventListener('message', onMessage)

      const features = formatFeatures(computeGeometry(this.options))
      try {
        this.popup = window.open('about:blank', this.name, features)
      } catch {
        settle(() =>
          reject(new SocialAuthError('popup_blocked', 'OAuth popup could not be opened')),
        )
        return
      }
      if (!this.popup) {
        settle(() => reject(new SocialAuthError('popup_blocked', 'OAuth popup was blocked')))
        return
      }
      try {
        this.popup.focus()
      } catch {
        /* ignore */
      }

      deadline = window.setTimeout(() => {
        settle(() =>
          reject(new SocialAuthError('timeout', 'Timed out waiting for the authorization popup')),
        )
      }, options.timeoutMs)

      timer = window.setInterval(() => {
        if (done) return
        if (!this.popup || this.popup.closed) {
          // Stop polling — the window is gone — but give a queued postMessage
          // result one grace period to win before rejecting.
          if (timer !== undefined) window.clearInterval(timer)
          timer = undefined
          grace = window.setTimeout(() => {
            settle(() =>
              reject(new SocialAuthError('popup_closed', 'Authorization popup was closed')),
            )
          }, CLOSE_GRACE_MS)
          return
        }

        let location: Location
        try {
          location = this.popup.location
          // Touch href to provoke the cross-origin throw before reading more.
          if (!location.href || location.href === 'about:blank') return
        } catch {
          // Cross-origin: still on the provider, or a cross-origin callback
          // that will come back over postMessage instead.
          return
        }

        if (location.pathname !== redirectPath) return
        // Query string only. A fragment carrying an implicit-flow access_token
        // is not a result this library will ever return.
        const params = parseQuery(location.search)
        // Same acceptance rule as the postMessage channel: a result must carry
        // this flow's `state` (or a provider `error`). A bare page at the
        // redirect path — e.g. an SPA route that already consumed its query —
        // is not a result.
        const isUnstatedError = params.state === undefined && params.error !== undefined
        if (!isUnstatedError && params.state !== options.expectedState) return
        succeed(params)
      }, POLL_INTERVAL_MS)
    })
  }

  /**
   * Navigate the already-open popup to the authorization URL. The popup is
   * still on `about:blank` (same-origin), so `location.replace` is permitted
   * and keeps `about:blank` out of the popup's history.
   */
  navigate(url: string): void {
    this.popup?.location.replace(url)
  }

  /** Settle the pending {@link open} promise with `err`. No-op once settled. */
  cancel(err: Error): void {
    this.abort?.(err)
  }
}
