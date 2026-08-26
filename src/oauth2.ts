import { SocialAuthError } from './errors'
import { buildAuthorizationQuery } from './options'
import { createPkcePair } from './pkce'
import { OAuthPopup } from './popup'
import type {
  AuthenticateResult,
  AuthorizationResponse,
  ProviderConfig,
  StorageAdapter,
} from './types'
import { encodeForm, isFunction, randomString } from './utils'

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

    // Keys are scoped by the flow's own state, not just the provider name:
    // two concurrent authenticate() calls for one provider would otherwise
    // overwrite each other's entries, and the first to return would fail
    // verification against the second's state.
    const stateKey = `${name}.${state}.state`
    const verifierKey = `${name}.${state}.verifier`

    // Generate the PKCE pair BEFORE writing anything: crypto.subtle throws in
    // a non-secure context, and a flow that cannot start must leave no trace.
    let challenge: string | undefined
    let verifierValue: string | undefined
    if (this.providerConfig.pkce) {
      const pair = await createPkcePair()
      challenge = pair.challenge
      verifierValue = pair.verifier
    }

    const clear = (): void => {
      this.storage.removeItem(stateKey)
      this.storage.removeItem(verifierKey)
    }

    this.storage.setItem(stateKey, state)
    if (verifierValue !== undefined) this.storage.setItem(verifierKey, verifierValue)

    let response: AuthorizationResponse
    try {
      const query = buildAuthorizationQuery(this.providerConfig, state, challenge)
      const url = `${this.providerConfig.authorizationEndpoint}?${query}`
      const popup = new OAuthPopup(url, name, this.providerConfig.popupOptions ?? {})
      response = await popup.open({
        redirectUri: this.providerConfig.redirectUri ?? '',
        expectedState: state,
        timeoutMs: this.providerConfig.popupTimeoutMs,
      })
    } catch (err) {
      clear()
      throw err
    }

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

    if (this.providerConfig.url) {
      return this.exchangeWithServer(response, userData, verifier)
    }
    if (verifier && this.providerConfig.tokenEndpoint) {
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
    verifier: string,
  ): Promise<AuthenticateResult> {
    return postForJson(this.providerConfig.tokenEndpoint!, {
      contentType: 'application/x-www-form-urlencoded',
      body: encodeForm({
        grant_type: 'authorization_code',
        code: response.code,
        client_id: this.providerConfig.clientId,
        redirect_uri: this.providerConfig.redirectUri ?? '',
        code_verifier: verifier,
      }),
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
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    return (await res.json()) as Record<string, unknown>
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}
