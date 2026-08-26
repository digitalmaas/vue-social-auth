# @digitalmaas/vue-social-auth

Social OAuth 2.0 authentication for Vue 2.7+ and Vue 3.

- OAuth 2.0 only — authorization code flow, with PKCE on by default where the browser is the client
- Stateless: returns the exchange response, you store it where you like (Pinia, cookie, etc.)
- Zero HTTP dependencies — uses `window.fetch`
- Dual Vue 2.7+ / Vue 3 via [`vue-demi`](https://github.com/vueuse/vue-demi)
- Ships ESM + UMD (`<script>` tag)
- Based on [vue-authenticate](https://github.com/dgrubelic/vue-authenticate) and [vue-authenticate-2](https://github.com/ajmas/vue-authenticate-2)

## Install

```sh
# npm
npm install @digitalmaas/vue-social-auth

# pnpm
pnpm add @digitalmaas/vue-social-auth

# yarn
yarn add @digitalmaas/vue-social-auth
```

### Approve vue-demi's post-install script

`vue-demi` ships a `postinstall` script (`vue-demi-switch`) that aligns the
package with the Vue version present in your project. Modern package managers
block install scripts by default, so you may have to approve `vue-demi`
explicitly the first time you install:

| Package manager | Command                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| npm (11+)       | `npm approve-scripts vue-demi` (or add `"allowScripts": { "vue-demi@<ver>": true }` to your `package.json`) |
| pnpm            | add `vue-demi` to `pnpm.onlyBuiltDependencies` in `package.json`, then `pnpm install`                       |
| yarn (berry)    | `yarn config set enableScripts true` (project scope), or add to `dependenciesMeta`                          |

Symptom that it was skipped: the bundle imports the Vue 3 entry of `vue-demi`
on a Vue 2.7 project and you see errors like `Cannot read properties of
undefined (reading 'createApp')` or `'isVue2' is not exported by vue-demi`.
Running the approval command and reinstalling fixes it.

## Usage

### Vue plugin

```ts
import { createApp } from 'vue'
import { createSocialAuth } from '@digitalmaas/vue-social-auth'
import App from './App.vue'

const socialAuth = createSocialAuth({
  providers: {
    google: {
      clientId: 'YOUR_GOOGLE_CLIENT_ID',
      url: '/api/auth/google', // backend exchange URL
    },
    github: {
      clientId: 'YOUR_GITHUB_CLIENT_ID',
      url: '/api/auth/github',
    },
  },
})

createApp(App).use(socialAuth).mount('#app')
```

### Composable

```ts
import { useSocialAuth } from '@digitalmaas/vue-social-auth'

const socialAuth = useSocialAuth()

async function signInWithGoogle() {
  const session = await socialAuth.authenticate('google')
  // session = whatever your backend returned from /api/auth/google
}
```

### Standalone class (no Vue plugin)

```ts
import { SocialAuth } from '@digitalmaas/vue-social-auth'

const auth = new SocialAuth({
  providers: { google: { clientId: '...', url: '/api/auth/google' } },
})
await auth.authenticate('google')
```

## OAuth flows

### Server-side code exchange (recommended)

Set `providers[name].url`. After the popup returns an authorization code, the library
POSTs JSON to that URL:

```jsonc
{
  "code": "...",
  "clientId": "...",
  "redirectUri": "...",
  "state": "...",
  "codeVerifier": "..." /* when pkce: true */,
}
```

The response is returned to the caller verbatim. Your backend is responsible for
exchanging the code with the provider using the client secret.

### PKCE

PKCE (Proof Key for Code Exchange, [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636))
binds the authorization code to a secret only your client knows. The client mints a
random `code_verifier`, sends only its SHA-256 hash on the authorization request, and
presents the raw verifier when redeeming the code. An attacker who steals the code —
from the popup's URL, browser history, a `Referer` header, a proxy log — cannot redeem
it, because they never saw the verifier.

This matters more in a browser than it might seem. The code arrives in a URL, and a URL
is the least private thing in a browser.

> **PKCE is not a substitute for `state`, and `state` is not a substitute for PKCE.**
> `state` stops an attacker injecting _their_ code into _your_ session (login CSRF).
> PKCE stops an attacker redeeming _your_ stolen code. This library always sends
> `state`; PKCE is the other half.

#### Defaults

| Flow                  | Config                    | PKCE default | Why                                                                                                                                                                                                      |
| --------------------- | ------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct token exchange | `tokenEndpoint`, no `url` | **on**       | The browser redeems the code itself, so it is a public client. [draft-ietf-oauth-browser-based-apps](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps) requires PKCE for these. |
| Backend exchange      | `url`                     | **off**      | Enabling it changes a contract this library does not own — your backend must forward the verifier. Turning it on silently would break working logins. See below.                                         |

Set `pkce` explicitly to override either default:

```ts
providers: {
  // opt out of the default (not recommended — only if your provider rejects PKCE)
  google: { clientId: '...', tokenEndpoint: '...', pkce: false },

  // opt in for a backend-exchange provider (recommended, once your backend is ready)
  github: { clientId: '...', url: '/api/auth/github', pkce: true },
}
```

#### Turning PKCE on for a backend-exchange provider

This is the recommended end state, and it is a **two-sided change**. Do the backend
first. If you set `pkce: true` before the backend forwards the verifier, the provider
will reject every exchange with `invalid_grant` and your logins will break.

**1. Ship the backend change.**

With `pkce: true`, the library adds one field to the JSON it POSTs to your `url`:

```jsonc
{
  "code": "...",
  "clientId": "...",
  "redirectUri": "...",
  "state": "...",
  "codeVerifier": "dBjftJeZ4CVP...", // <- new
}
```

Your handler must pass that value through to the provider's token endpoint as
`code_verifier`, alongside the parameters it already sends:

```js
// POST /api/auth/github
export async function handler(req, res) {
  const { code, redirectUri, codeVerifier } = req.body

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET, // still required for a confidential client
      code_verifier: codeVerifier, // <- the new part
    }),
  })

  res.json(await response.json())
}
```

Three things to get right:

- **`redirect_uri` must match** the one used on the authorization request, exactly. The
  library sends you the value it used, in `redirectUri` — echo that, do not rebuild it.
- **Keep the client secret.** PKCE augments the secret for a confidential backend
  client; it does not replace it. (For a _public_ client with no backend there is no
  secret to send — that is the `tokenEndpoint` flow.)
- **Accept the verifier as optional during rollout**, so the backend tolerates both old
  and new clients while you deploy. Tighten it to required once the frontend has shipped.

**2. Confirm your provider supports PKCE.** Support varies, and some providers reject
unrecognised parameters outright. Check the provider's current OAuth documentation for
`code_challenge` before flipping the flag — do not assume.

**3. Flip `pkce: true` on the provider** and verify a real login end to end.

#### Flow options in full

1. **PKCE + backend exchange** (recommended for most providers). Set `url` and
   `pkce: true`, having done the backend work above. The library generates the
   verifier, sends the challenge to the authorization endpoint, and forwards the
   verifier to your backend as `codeVerifier`. Your backend swaps both with the
   provider. Safest browser flow, and works regardless of CORS.

2. **PKCE-only, no backend** (public client). Set a `tokenEndpoint` and the library
   posts `application/x-www-form-urlencoded` directly to the provider. PKCE is on by
   default here.

   ```ts
   createSocialAuth({
     providers: {
       google: {
         clientId: '...',
         tokenEndpoint: 'https://oauth2.googleapis.com/token',
       },
     },
   })
   ```

   **CORS caveat:** Only Google currently permits browser-direct token exchange.
   GitHub, Facebook, and Instagram do **not** send CORS headers on their token
   endpoints, so the browser blocks the request even when the URL and verifier are
   correct. For those providers, use option 1 instead. The library ships no default
   `tokenEndpoint` values so the configuration choice stays explicit.

Setting `pkce: true` with neither `url` nor `tokenEndpoint` is rejected up front with
`code: 'config'`: the verifier would have nowhere to be redeemed.

## The callback page

When the popup returns, the library reads the result over one of two channels.
Both are armed for every flow; whichever answers first wins.

**Same-origin callback — nothing to do.** If your `redirectUri` is on the same
origin as your app, the library reads the popup's URL directly and you need no
callback page.

**Cross-origin callback — host a callback page.** If the callback lands on a
different origin (app on `app.example.com`, callback on `auth.example.com`), the
browser forbids reading the popup's URL, so the result must be posted back:

```html
<!-- https://auth.example.com/callback -->
<script type="module">
  import { postAuthorizationResult } from '@digitalmaas/vue-social-auth/callback'
  postAuthorizationResult({ targetOrigin: 'https://app.example.com' })
</script>
```

`targetOrigin` is required and must be your app's exact origin. It is passed
straight to `postMessage`, and the payload carries the authorization code —
`'*'` would hand that code to whoever owns the opener. The library cannot infer
it, because only you know which origin is legitimate.

The parent accepts a message only if it came from the window it opened, from the
`redirectUri`'s origin, carries the library's envelope, and matches the `state`
of the flow in progress. Anything else is ignored.

The callback entry point is a separate, framework-free bundle (~2 kB): the page
does not load the client or Vue.

### Timeouts

Every flow gives up after `popupTimeoutMs` (default 5 minutes) and rejects with
`code: 'timeout'`, releasing its timers and clearing stored values. Set it per
provider.

### A note on `window.opener`

The popup keeps a reference to your app window — `postMessage` needs it, and it
survives the popup's navigations, so the provider's page holds that reference
while the popup is open. In principle the provider (or an open redirect chained
through it) could navigate your app. We cannot remove this without giving up the
return channel. It is bounded by the timeout above and by the provider being a
party you already trust with authentication. If that is unacceptable for your
threat model, you need a redirect-based flow, which this library does not offer.

## Errors

Every failure throws a `SocialAuthError` with a `code` you can branch on:

```ts
import { SocialAuthError } from '@digitalmaas/vue-social-auth'

try {
  await socialAuth.authenticate('google')
} catch (error) {
  if (error instanceof SocialAuthError && error.code === 'popup_closed') {
    // the user changed their mind — not worth showing an error banner
  }
}
```

Codes: `config`, `popup_blocked`, `popup_closed`, `timeout`, `provider_error`,
`state_mismatch`, `state_missing`, `verifier_missing`, `exchange_failed`.

`config` covers everything the library can detect before opening a popup:
an unknown provider, a missing `clientId` or `authorizationEndpoint`, a `state`
pinned to a constant string, or `pkce: true` with neither `url` nor
`tokenEndpoint` (the verifier would have nowhere to be redeemed). These reject
without any popup being opened.

`message` is always a fixed library string. Text supplied by the provider is
kept out of it and exposed separately as `providerError` and
`providerErrorDescription` (and `status` for a failed exchange), so that a value
an attacker can influence is not rendered by apps that display `error.message`.
Escape those fields before displaying them.

## Storage

The library writes the OAuth `state` and PKCE `code_verifier` to `sessionStorage`
when the authorization popup opens, then **reads them once and deletes them** as the
callback is verified. The library does **not** persist provider or session tokens;
that is the consumer's responsibility (e.g. Pinia store, httpOnly cookie set by
your backend).

```ts
createSocialAuth() // sessionStorage is used by default
createSocialAuth({ storage: customAdapter }) // implements StorageAdapter
```

Keys are scoped per flow, so two logins started at once (a double-clicked
button) cannot overwrite each other. Each flow records an expiry; a later flow
sweeps entries left behind by one that was abandoned — for example because the
page navigated away while its popup was still open. A custom adapter opts into
that sweep by implementing the optional `keys()` method; without it the sweep is
simply skipped.

`sessionStorage` is required. If it is unavailable (SSR, private mode in some
browsers), the constructor throws — pass a custom `StorageAdapter` to bridge to
whatever storage you do have. `localStorage` and in-memory backends are not offered:
the verifier and state are short-lived and tied to the auth flow, so long-lived
storage adds risk without benefit, and an in-memory fallback would silently mask
sessionStorage being disabled.

## Built-in provider presets

`google`, `github`, `facebook`, `instagram`, `oauth2` (generic). Override or extend
any preset by passing the same key in `providers`. Anything you pass is
shallow-merged onto the preset.

You can also register a provider under any key of your own — a custom key behaves
exactly like a preset one, including `state` handling and `redirectUri` resolution.

`redirectUri` may be absolute, or relative to the current origin (`/callback`).
Omit it and the current origin is used. It is resolved when `authenticate()` runs,
so importing the library on a server is safe.

## The `state` parameter

`state` is sent on every authorization request and verified on the way back — it is
not an opt-in parameter, and listing it in `optionalUrlParams` is unnecessary. By
default the library generates a fresh 22-character random value per flow from
`crypto.getRandomValues`.

If you need the value to be something specific (a nonce your backend issued, say),
pass a **function**, which is called once per flow:

```ts
providers: {
  mycorp: { clientId: '...', state: () => sessionNonceFromServer() },
}
```

A constant string is rejected by the type system on purpose. It would pass every
check the library can make while providing none of the protection `state` exists
for: anyone who knows the constant can mount the login-CSRF described in
RFC 6819 §4.4.1.8.

## API

```ts
new SocialAuth(options).authenticate(name, {
  userData?: Record<string, unknown>,  // merged into exchange body
  override?: Partial<ProviderConfig>,   // per-call config override
})
```

Returns the parsed JSON response from the configured `url` or `tokenEndpoint`. When
neither is set, returns the raw `{ code, state }` from the popup.

## Build

- `npm run build` — emits ESM (`dist/index.js`), UMD (`dist/index.umd.js`), and
  `.d.ts` via [tsdown](https://tsdown.dev/) (Rolldown + Oxc). The callback entry
  point is built separately as `dist/callback.js` / `dist/callback.umd.js`.
- `npm test` — runs vitest with happy-dom, against both Vue 2.7 and Vue 3.
- `npm run check` — runs `oxlint`, `oxfmt --check`, and `tsc --noEmit`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Releases are automated from commit
messages, so the commit message you write decides the next version number —
that document explains the mapping.

## License

MIT
