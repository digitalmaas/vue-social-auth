/**
 * Why a flow failed. Branch on {@link SocialAuthError.code} rather than
 * matching on message text, which is not part of the public contract.
 *
 * - `config` — the provider configuration cannot produce a valid flow. Raised
 *   before any popup opens.
 * - `popup_blocked` — the browser refused to open the popup.
 * - `popup_closed` — the user closed the popup before authorizing.
 * - `timeout` — no result arrived within the popup timeout.
 * - `provider_error` — the provider redirected back with an `error`. See
 *   {@link SocialAuthError.providerError}.
 * - `state_mismatch` — the returned `state` did not match the one sent.
 * - `state_missing` — the stored `state` was gone when the callback arrived.
 * - `verifier_missing` — the stored PKCE `code_verifier` was gone.
 * - `exchange_failed` — the token exchange returned a non-2xx response.
 *
 * @public
 */
export type SocialAuthErrorCode =
  | 'config'
  | 'popup_blocked'
  | 'popup_closed'
  | 'timeout'
  | 'provider_error'
  | 'state_mismatch'
  | 'state_missing'
  | 'verifier_missing'
  | 'exchange_failed'

/**
 * Error thrown by every failing path of {@link SocialAuth.authenticate}.
 *
 * `message` is always a fixed library string. Text supplied by the provider is
 * kept out of it and exposed on {@link providerError} and
 * {@link providerErrorDescription} instead, so that a value an attacker can
 * influence is not rendered by apps that display `error.message`.
 *
 * @public
 */
export class SocialAuthError extends Error {
  /** Why the flow failed. See {@link SocialAuthErrorCode}. */
  readonly code: SocialAuthErrorCode
  /** The provider's `error` code, when the provider reported one. */
  readonly providerError?: string
  /** The provider's `error_description`. Untrusted: escape before display. */
  readonly providerErrorDescription?: string
  /** HTTP status, when the failure was a token-exchange response. */
  readonly status?: number

  constructor(
    code: SocialAuthErrorCode,
    message: string,
    details: {
      providerError?: string
      providerErrorDescription?: string
      status?: number
      cause?: unknown
    } = {},
  ) {
    super(message)
    this.name = 'SocialAuthError'
    // Assigned rather than passed to super(): `cause` on the Error constructor
    // is ES2022, and this package targets ES2020.
    if (details.cause !== undefined) (this as { cause?: unknown }).cause = details.cause
    this.code = code
    this.providerError = details.providerError
    this.providerErrorDescription = details.providerErrorDescription
    this.status = details.status
    // Extending built-ins needs the prototype restored when targeting ES5-era
    // downlevel output; harmless otherwise.
    Object.setPrototypeOf(this, SocialAuthError.prototype)
  }
}
