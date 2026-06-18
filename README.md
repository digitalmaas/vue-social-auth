# @digitalmaas/vue-social-auth

Social OAuth 2.0 authentication for Vue 2.7+ and Vue 3.

- OAuth 2.0 only — authorization code flow with optional PKCE
- Stateless: returns the exchange response, you store it where you like (Pinia, cookie, etc.)
- Zero HTTP dependencies — uses `window.fetch`
- Dual Vue 2.7+ / Vue 3 via [`vue-demi`](https://github.com/vueuse/vue-demi)
- Ships ESM + IIFE (`<script>` tag)
- Based on [vue-authenticate](https://github.com/dgrubelic/vue-authenticate) and [vue-authenticate-2](https://github.com/ajmas/vue-authenticate-2)

## Install

```sh
npm install @digitalmaas/vue-social-auth
```

## Usage

### Vue plugin

```ts
import { createApp } from 'vue'
import { createSocialAuth } from '@digitalmaas/vue-social-auth'
import App from './App.vue'

const socialAuth = createSocialAuth({
  storage: 'session', // 'session' | 'memory' | custom adapter
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
  "codeVerifier": "..." /* when pkce: true */
}
```

The response is returned to the caller verbatim. Your backend is responsible for
exchanging the code with the provider using the client secret.

### PKCE (no backend secret)

Set `pkce: true` and a `tokenEndpoint` (the provider's token URL). The built-in
presets for `google`, `github`, `facebook`, and `instagram` already carry the
correct `tokenEndpoint`, so for those `pkce: true` is the only extra field
needed:

```ts
const socialAuth = createSocialAuth({
  providers: {
    google: { clientId: '...', pkce: true },
  },
})
```

For the generic `oauth2` preset (or any custom provider), supply
`tokenEndpoint` yourself.

You can combine both: when both `url` and `pkce` are set, the verifier is forwarded
to your backend as `codeVerifier`.

**CORS reality check.** Only Google currently permits browser-direct PKCE
exchange (its `oauth2.googleapis.com/token` endpoint sends CORS headers).
GitHub, Facebook, and Instagram do not allow cross-origin requests to their
token endpoints, so a popup-side PKCE exchange will be blocked by the browser
even when the URL and verifier are correct. For those providers, use the
server-exchange flow (`url`): the popup returns the code, the library POSTs it
to your backend, and your backend completes the exchange — combine with
`pkce: true` if you want PKCE protection without trusting the client with the
final swap.

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
