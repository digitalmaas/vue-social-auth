# @digitalmaas/vue-social-auth

Social OAuth 2.0 authentication for Vue 2.7+ and Vue 3.

- OAuth 2.0 only — authorization code flow with optional PKCE
- Stateless: returns the exchange response, you store it where you like (Pinia, cookie, etc.)
- Zero HTTP dependencies — uses `window.fetch`
- Dual Vue 2.7+ / Vue 3 via [`vue-demi`](https://github.com/vueuse/vue-demi)
- Ships ESM + IIFE (`<script>` tag)

## Install

```sh
npm install @digitalmaas/vue-social-auth vue-demi
```

`vue-demi` is a runtime peer that selects the correct Vue version.

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

```json
{
  "code": "...",
  "clientId": "...",
  "redirectUri": "...",
  "state": "...",
  "codeVerifier": "..." // when pkce: true
}
```

The response is returned to the caller verbatim. Your backend is responsible for
exchanging the code with the provider using the client secret.

### PKCE (no backend secret)

Set `pkce: true` and `tokenEndpoint` (the provider's token URL). The library
posts `application/x-www-form-urlencoded` directly to the provider:

```ts
const socialAuth = createSocialAuth({
  providers: {
    google: {
      clientId: '...',
      pkce: true,
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    },
  },
})
```

You can combine both: when both `url` and `pkce` are set, the verifier is forwarded
to your backend as `codeVerifier`.

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

- `npm run build` — emits ESM (`dist/index.js`), IIFE (`dist/index.global.js`), and
  `.d.ts` via [tsup](https://tsup.egoist.dev/).
- `npm test` — runs vitest with jsdom.

## License

MIT
