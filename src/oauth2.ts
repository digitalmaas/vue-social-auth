import { SocialAuthError } from './errors'
import { buildAuthorizationQuery } from './options'
import { createPkcePair } from './pkce'
import { OAuthPopup } from './popup'
import { flowKeys, sweepExpiredFlows } from './storage'
import type {
  AuthenticateResult,
  AuthorizationResponse,
  ProviderConfig,
  StorageAdapter,
} from './types'
import { isFunction, randomString } from './utils'

const DEFAULT_POPUP_TIMEOUT_MS = 300_000

export interface OAuth2RunnerOptions {
  withCredentials: boolean
}

export class OAuth2Runner {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly providerConfig: ProviderConfig,
    private readonly options: OAuth2RunnerOptions,
  ) {}

  async run(userData?: Record<string, unknown>): Promise<AuthenticateResult> {
    const name = this.providerConfig.name ?? 'oauth2'
    const state = this.resolveState()

    const keys = flowKeys(name, state)
    const { state: stateKey, verifier: verifierKey } = keys

    const clear = (): void => {
      this.storage.removeItem(stateKey)
      this.storage.removeItem(verifierKey)
      this.storage.removeItem(keys.expiry)
    }

    const timeoutMs = this.providerConfig.popupTimeoutMs ?? DEFAULT_POPUP_TIMEOUT_MS

    // The window must open synchronously inside the user's click: Safari does
    // not preserve transient activation across an awaited promise, so any
    // await before this point (PKCE's crypto.subtle, notably) would turn a
    // legitimate click into popup_blocked. The popup opens on about:blank and
    // is navigated to the authorization URL once it is built.
    //
    // The window name must be unique per flow. A shared name makes the
    // browser re-navigate the existing popup, so two concurrent flows would
    // fight over one window.
    const popup = new OAuthPopup(`${name}.${state}`, this.providerConfig.popupOptions ?? {})
    const responsePromise = popup.open({
      redirectUri: this.providerConfig.redirectUri ?? '',
      expectedState: state,
      timeoutMs,
    })
    // Handled at the await below; without this, a rejection while the async
    // preparation runs would surface as an unhandled rejection first.
    responsePromise.catch(() => {})

    try {
      // Generate the PKCE pair BEFORE writing anything: crypto.subtle throws
      // in a non-secure context, and a flow that cannot start must leave no
      // trace in storage.
      let challenge: string | undefined
      let verifierValue: string | undefined
      if (this.providerConfig.pkce) {
        const pair = await createPkcePair()
        challenge = pair.challenge
        verifierValue = pair.verifier
      }

      // Collect anything left by flows that were abandoned before they could
      // clean up. Live concurrent flows have a future expiry and are untouched.
      sweepExpiredFlows(this.storage, Date.now())

      this.storage.setItem(stateKey, state)
      this.storage.setItem(keys.expiry, String(Date.now() + timeoutMs))
      if (verifierValue !== undefined) this.storage.setItem(verifierKey, verifierValue)

      const query = buildAuthorizationQuery(this.providerConfig, state, challenge)
      popup.navigate(`${this.providerConfig.authorizationEndpoint}?${query}`)
    } catch (err) {
      // Settle the pending open() with the real failure; the await below then
      // rejects with it and the shared cleanup runs.
      popup.cancel(err instanceof Error ? err : new Error(String(err)))
    }

    let response: AuthorizationResponse
    try {
      response = await responsePromise
    } catch (err) {
      clear()
      throw err
    }

    this.storage.removeItem(keys.expiry)
    const storedState = this.takeItem(stateKey)
    if (!storedState) {
      this.storage.removeItem(verifierKey)
      throw new SocialAuthError('state_missing', 'OAuth state missing from storage — flow aborted')
    }
    if (response.state !== storedState) {
      this.storage.removeItem(verifierKey)
      throw new SocialAuthError('state_mismatch', 'OAuth state mismatch — possible CSRF')
    }

    const verifier = this.providerConfig.pkce ? this.takeItem(verifierKey) : undefined
    if (this.providerConfig.pkce && !verifier) {
      throw new SocialAuthError(
        'verifier_missing',
        'PKCE code_verifier missing from storage — flow aborted',
      )
    }

    if (!response.code) {
      throw new SocialAuthError(
        'provider_error',
        'Authorization response is missing the code parameter',
      )
    }

    if (this.providerConfig.url) {
      return this.exchangeWithServer(response, userData, verifier)
    }
    if (this.providerConfig.tokenEndpoint) {
      return this.exchangeWithProvider(response, verifier)
    }
    return response
  }

  /** Read and immediately clear a storage entry. */
  private takeItem(key: string): string | undefined {
    const value = this.storage.getItem(key)
    this.storage.removeItem(key)
    return value ?? undefined
  }

  /**
   * A caller-supplied function is invoked once per flow (for server-bound
   * nonces); otherwise a fresh CSPRNG value is generated. A constant string is
   * deliberately not accepted — see {@link StateProvider}.
   */
  private resolveState(): string {
    const raw = this.providerConfig.state
    if (isFunction(raw)) return String(raw())
    return randomString(16)
  }

  private async exchangeWithServer(
    response: AuthorizationResponse,
    userData: Record<string, unknown> | undefined,
    verifier: string | undefined,
  ): Promise<AuthenticateResult> {
    const body: Record<string, unknown> = {
      ...userData,
      code: response.code,
      clientId: this.providerConfig.clientId,
      redirectUri: this.providerConfig.redirectUri,
    }
    if (response.state) body.state = response.state
    if (verifier) body.codeVerifier = verifier

    return postForJson(this.providerConfig.url!, {
      contentType: 'application/json',
      body: JSON.stringify(body),
      credentials: this.options.withCredentials ? 'include' : 'same-origin',
    })
  }

  private async exchangeWithProvider(
    response: AuthorizationResponse,
    verifier: string | undefined,
  ): Promise<AuthenticateResult> {
    const params: Record<string, string> = {
      grant_type: 'authorization_code',
      code: response.code,
      client_id: this.providerConfig.clientId,
      redirect_uri: this.providerConfig.redirectUri ?? '',
    }
    if (verifier) params.code_verifier = verifier

    return postForJson(this.providerConfig.tokenEndpoint!, {
      contentType: 'application/x-www-form-urlencoded',
      body: new URLSearchParams(params).toString(),
    })
  }
}

/** POST an exchange request and parse the response. Shared by both flows. */
async function postForJson(
  url: string,
  init: { contentType: string; body: string; credentials?: RequestCredentials },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': init.contentType, Accept: 'application/json' },
    body: init.body,
    ...(init.credentials ? { credentials: init.credentials } : {}),
  })
  return readJson(res)
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new SocialAuthError('exchange_failed', 'OAuth token exchange failed', {
      status: res.status,
      providerErrorDescription: text || res.statusText,
    })
  }
  // Parse from text rather than res.json(): an empty or malformed body on a
  // 2xx response must not escape as a raw SyntaxError past the
  // SocialAuthError contract.
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}
