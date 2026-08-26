# @digitalmaas/vue-social-auth

Social OAuth 2.0 authentication for Vue 2.7+ and Vue 3.

- OAuth 2.0 only — authorization code flow with optional PKCE
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

PKCE (Proof Key for Code Exchange, RFC 7636) protects the authorization code
from interception. Enable it by setting `pkce: true` on a provider. PKCE
composes with either exchange flow:

1. **PKCE + backend exchange** (recommended for most providers). Set `url` and
   `pkce: true`. The library generates a verifier, sends the challenge to the
   authorization endpoint, and forwards the verifier to your backend as
   `codeVerifier` alongside the code. Your backend swaps both with the
   provider. This is the safest browser flow and works regardless of CORS.

   ```ts
   createSocialAuth({
     providers: {
       github: { clientId: '...', url: '/api/auth/github', pkce: true },
     },
   })
   ```

2. **PKCE-only, no backend** (public client). Set `pkce: true` and a
   `tokenEndpoint` pointing at the provider's token URL. The library posts
   `application/x-www-form-urlencoded` directly to the provider.

   ```ts
   createSocialAuth({
     providers: {
       google: {
         clientId: '...',
         pkce: true,
         tokenEndpoint: 'https://oauth2.googleapis.com/token',
       },
     },
   })
   ```

   **CORS caveat:** Only Google currently permits browser-direct token
   exchange. GitHub, Facebook, and Instagram do **not** send CORS headers on
   their token endpoints, so the browser blocks the request even when the URL
   and verifier are correct. For those providers, use option 1 (backend
   exchange) instead. The library does not ship default `tokenEndpoint`
   values for the presets so the configuration choice stays explicit.

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
  `.d.ts` via [tsdown](https://tsdown.dev/) (Rolldown + Oxc).
- `npm test` — runs vitest with happy-dom.
- `npm run check` — runs `oxlint`, `oxfmt --check`, and `tsc --noEmit`.

## License

MIT
