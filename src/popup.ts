import type { AuthorizationResponse, PopupOptions } from './types'
import { parseQuery } from './utils'

const POLL_INTERVAL_MS = 250

interface PopupGeometry {
  width: number
  height: number
  left: number
  top: number
}

function computeGeometry(opts: PopupOptions): PopupGeometry {
  const width = opts.width ?? 500
  const height = opts.height ?? 600
  const screen = typeof window !== 'undefined' ? window.screen : undefined
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

export class OAuthPopup {
  private popup: Window | null = null

  constructor(
    private readonly url: string,
    private readonly name: string,
    private readonly options: PopupOptions = {},
  ) {}

  open(redirectUri: string): Promise<AuthorizationResponse> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('OAuth popup requires a browser environment'))
    }
    const features = formatFeatures(computeGeometry(this.options))
    this.popup = window.open(this.url, this.name, features)
    if (!this.popup) {
      return Promise.reject(new Error('OAuth popup was blocked'))
    }
    try {
      this.popup.focus()
    } catch {
      /* ignore */
    }
    return this.poll(redirectUri)
  }

  private poll(redirectUri: string): Promise<AuthorizationResponse> {
    return new Promise((resolve, reject) => {
      const redirectPath = new URL(redirectUri, window.location.origin).pathname
      const timer = window.setInterval(() => {
        if (!this.popup || this.popup.closed) {
          window.clearInterval(timer)
          reject(new Error('Authorization popup was closed'))
          return
        }
        let href: string | undefined
        try {
          href = this.popup.location.href
        } catch {
          /* cross-origin; still on provider page */
          return
        }
        if (!href || href === 'about:blank') return
        const matchesRedirect =
          this.popup.location.pathname === redirectPath || href.startsWith(redirectUri)
        if (!matchesRedirect) return

        const search = this.popup.location.search
        const hash = this.popup.location.hash
        const params = { ...parseQuery(search), ...parseQuery(hash) } as AuthorizationResponse

        window.clearInterval(timer)
        this.popup.close()
        this.popup = null

        if (params.error) {
          reject(new Error(String(params.error_description ?? params.error)))
        } else {
          resolve(params)
        }
      }, POLL_INTERVAL_MS)
    })
  }
}
