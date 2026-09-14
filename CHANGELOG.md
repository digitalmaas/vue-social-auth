# Changelog

All notable changes to this project are documented here.
This file is generated from commit messages by [semantic-release](https://semantic-release.gitbook.io/) — edit the commits, not this file.

## 1.0.0

First release. A ground-up rewrite of `vue-authenticate`, reduced to the
OAuth 2.0 authorization-code flow in a popup.

### Highlights

- Vue 2.7 and Vue 3 from one package, via `vue-demi`. Plugin (`$socialAuth`)
  and composable (`useSocialAuth()`); the `$auth` prototype property is gone.
- Two ways to redeem the code: your backend (`url`) or the provider's token
  endpoint directly (`tokenEndpoint`). The library returns the exchange
  response and holds no session state of its own.
- PKCE (S256), on by default for the direct token-endpoint flow, opt-in for
  the backend flow.
- Result delivery over `postMessage` from a callback page, so the redirect
  URI may live on another origin. Same-origin polling remains as a fallback.
  The callback page imports `@digitalmaas/vue-social-auth/callback` and calls
  `postAuthorizationResult({ targetOrigin })`, where `targetOrigin` must be an
  exact origin.
- `SocialAuthError` with a `code` to branch on (`config`, `popup_blocked`,
  `popup_closed`, `timeout`, `state_mismatch`, `provider_error`,
  `exchange_failed`, ...). Provider error text is exposed as structured
  fields, never interpolated into `message`.
- `state` is always sent and always verified; a constant `state` is rejected.
  Storage is `sessionStorage` (custom adapters supported), scoped per flow so
  concurrent flows cannot collide, with expired flows swept automatically.
- Every flow has a bounded lifetime (`popupTimeoutMs`, default 5 minutes).
- Presets: `google`, `github`, `facebook`, `instagram`, `oauth2`. The
  `twitter`, `bitbucket`, `linkedin` and `live` presets from the base libraries
  were dropped; configure such providers under a custom key.
- Ships ESM, UMD (`.umd.cjs`) and type declarations; `window.fetch` only, no
  axios.
