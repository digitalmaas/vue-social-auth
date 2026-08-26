/**
 * Minimal key/value adapter used to persist the OAuth `state` and PKCE
 * `code_verifier` between popup open and callback verification.
 *
 * The adapter must be synchronous. The library writes both values when the
 * popup opens and removes them immediately during the callback handshake — it
 * never relies on the values surviving page reload or long-term storage.
 *
 * @public
 */
export interface StorageAdapter {
  /** Returns the value for `key`, or `null` if absent. */
  getItem(key: string): string | null
  /** Stores `value` under `key`, overwriting any prior value. */
  setItem(key: string, value: string): void
  /** Removes `key`. No-op if the key was not present. */
  removeItem(key: string): void
  /**
   * Optional. Lists every key this adapter holds, without the namespace
   * prefix. When implemented, the library uses it to sweep entries left by
   * flows that were abandoned before they could clean up after themselves
   * (e.g. the page navigated away while a popup was open).
   */
  keys?(): string[]
}

/**
 * Size of the popup window opened against the provider's authorization
 * endpoint. Both dimensions are pixel counts; omitted values fall back to
 * `500 x 600`.
 *
 * @public
 */
export interface PopupOptions {
  /** Popup width in pixels. */
  width?: number
  /** Popup height in pixels. */
  height?: number
}

/**
 * Source for the OAuth `state` parameter on a provider configuration.
 *
 * A function, invoked once per `authenticate()` call, whose return value is
 * used as the state. Useful for stamping a CSRF token bound to the current
 * session. When omitted, the library generates a 22-char base64url random
 * string from `crypto.getRandomValues`.
 *
 * A constant string is deliberately **not** accepted. It would satisfy every
 * check the library can make — stored, echoed, compared equal — while
 * providing none of the protection `state` exists for: anyone who knows the
 * constant can mount the login-CSRF of RFC 6819 §4.4.1.8. Supply a function
 * if you need to control the value.
 *
 * @public
 */
export type StateProvider = () => string

/**
 * Configuration for a single OAuth 2.0 provider.
 *
 * Most fields are passed through to the authorization URL (`name`, `clientId`,
 * `scope`, etc.). The `url`, `tokenEndpoint`, and `pkce` fields together
 * select the exchange flow — see {@link SocialAuthOptions} for the
 * decision tree.
 *
 * Unknown keys (any extra property not listed below) are forwarded into the
 * authorization URL when referenced from `requiredUrlParams` or
 * `optionalUrlParams`, letting consumers extend a provider without
 * subclassing.
 *
 * @public
 */
export interface ProviderConfig {
  /** Provider name. Defaults to the key in {@link SocialAuthOptions.providers}. */
  name?: string
  /** Public OAuth client ID. */
  clientId: string
  /** Provider authorization endpoint (the URL the popup opens). */
  authorizationEndpoint: string
  /** Redirect URI registered with the provider. */
  redirectUri?: string
  /**
   * Application backend URL that performs the code-for-token exchange. When
   * set, the library `POST`s the popup response (and `codeVerifier` if PKCE
   * is enabled) as JSON and returns the backend's response verbatim.
   */
  url?: string
  /**
   * Provider's token endpoint. Used when `pkce: true` is set and `url` is
   * not — the library posts `application/x-www-form-urlencoded` directly to
   * the provider. Subject to CORS on the provider side.
   */
  tokenEndpoint?: string
  /**
   * Enable PKCE (Proof Key for Code Exchange, RFC 7636, S256 method).
   * Recommended for any public client.
   */
  pkce?: boolean
  /** OAuth scopes. */
  scope?: string[]
  /** String prefixed to the joined scope (e.g. `openid`). */
  scopePrefix?: string
  /** Delimiter joining scope entries. Defaults to a single space. */
  scopeDelimiter?: string
  /** OAuth `state`. See {@link StateProvider}. */
  state?: StateProvider
  /** OAuth response type. Only `'code'` is supported. */
  responseType?: 'code'
  /**
   * Names of parameters that are always present on the authorization URL.
   * Defaults to `['response_type', 'client_id', 'redirect_uri']`.
   */
  defaultUrlParams?: string[]
  /**
   * Names of parameters that must be present on the authorization URL. The
   * provider is expected to reject the request when any of these is missing.
   */
  requiredUrlParams?: string[]
  /**
   * Names of parameters that are sent when they have a non-null value.
   */
  optionalUrlParams?: string[]
  /** Popup window size. See {@link PopupOptions}. */
  popupOptions?: PopupOptions
  /**
   * Milliseconds to wait for the popup to deliver a result before giving up
   * with a `timeout` error. Covers both the `postMessage` and polling
   * channels.
   * @defaultValue `300000` (5 minutes)
   */
  popupTimeoutMs?: number
  /**
   * Extra arbitrary parameters merged into the authorization URL when listed
   * by name in `requiredUrlParams` / `optionalUrlParams`.
   */
  [key: string]: unknown
}

/**
 * Per-call options accepted by {@link SocialAuth.authenticate}.
 *
 * @public
 */
export interface AuthenticateOptions {
  /**
   * Extra fields merged into the exchange request body alongside `code` and
   * the OAuth values. Useful for forwarding application context (e.g. an
   * invite token) to your backend.
   */
  userData?: Record<string, unknown>
  /**
   * Provider-config overrides that apply to this call only, leaving the
   * registered {@link ProviderConfig} unchanged. Handy for one-off scope
   * upgrades or test client IDs.
   */
  override?: Partial<ProviderConfig>
}

/**
 * Options accepted by {@link createSocialAuth} and the {@link SocialAuth}
 * constructor.
 *
 * @public
 */
export interface SocialAuthOptions {
  /**
   * Optional custom storage adapter for the OAuth `state` and PKCE
   * `code_verifier`. When omitted, the library uses `window.sessionStorage`;
   * if that is unavailable (SSR, private mode), construction throws.
   *
   * Entries are read-once and removed on the callback handshake, so the
   * adapter can be transient.
   */
  storage?: StorageAdapter
  /**
   * Prefix prepended to every storage key, separated by `.`.
   * @defaultValue `'vue-social-auth'`
   */
  storageNamespace?: string
  /**
   * When `true`, the exchange request to your backend (`providers[name].url`)
   * is sent with `credentials: 'include'`. Required when the backend reads
   * cookies from a different origin.
   * @defaultValue `false`
   */
  withCredentials?: boolean
  /**
   * Provider configurations keyed by provider name. Entries shallow-merge
   * onto the corresponding {@link providerPresets} entry, so most consumers
   * only need to supply `clientId` (and either `url` or `tokenEndpoint`).
   */
  providers?: Record<string, Partial<ProviderConfig>>
}

/**
 * Authorization response returned by the popup when the provider redirects
 * back to `redirectUri`. Includes the OAuth `code` and `state`, plus any
 * extra fields the provider attached.
 *
 * @public
 */
export interface AuthorizationResponse {
  /** OAuth authorization code returned by the provider. */
  code: string
  /**
   * Echoed `state` parameter. The library verifies it matches the value it
   * sent before proceeding.
   */
  state?: string
  /** Extra fields supplied by the provider on the redirect query string. */
  [key: string]: string | undefined
}

/**
 * Resolved value of {@link SocialAuth.authenticate}.
 *
 * - When `providers[name].url` is set, this is the parsed JSON returned by
 *   your backend exchange endpoint.
 * - When `pkce: true` is set with a `tokenEndpoint` and no `url`, this is
 *   the provider's token response.
 * - When neither is set, this is the raw {@link AuthorizationResponse} from
 *   the popup so the caller can complete the exchange on its own terms.
 *
 * @public
 */
export type AuthenticateResult = AuthorizationResponse | Record<string, unknown>
