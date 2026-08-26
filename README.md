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
