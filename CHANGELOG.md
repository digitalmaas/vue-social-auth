# Changelog

All notable changes to this project are documented here.
This file is generated from commit messages by [semantic-release](https://semantic-release.gitbook.io/) — edit the commits, not this file.

## 1.0.0 (2026-09-14)

### Features

* bake tokenEndpoint defaults into provider presets ([8f46d09](https://github.com/digitalmaas/vue-social-auth/commit/8f46d09f3a5e7dd0bffd97fefa7418ec33791401))
* **pkce:** default PKCE on where the browser is the OAuth client ([0f9bdcf](https://github.com/digitalmaas/vue-social-auth/commit/0f9bdcf3f84ef13bd3d23e26a0561b08a7f4da3c))
* **popup:** return results over postMessage, and always terminate ([ec0bfbc](https://github.com/digitalmaas/vue-social-auth/commit/ec0bfbc587117ed7fd6b5a0ed12450a8469573ae))
* scaffold OAuth 2.0 social auth library ([75c0ec4](https://github.com/digitalmaas/vue-social-auth/commit/75c0ec4d3b6cdeceebae63357204ec4d90358ecb))

### Bug Fixes

* close flow gaps found by full re-review ([84e72d2](https://github.com/digitalmaas/vue-social-auth/commit/84e72d2cd070f55c6a60330fd8570091d2d1e4ef))
* close the gaps found reviewing the remediation branch ([0c5411c](https://github.com/digitalmaas/vue-social-auth/commit/0c5411cd935bf7e9f295e53fd6e4cb37678641e0))
* emit UMD bundles as .cjs for require() ([d321ced](https://github.com/digitalmaas/vue-social-auth/commit/d321ced247e7f5d6536b930e20c6d17495976a03))
* **lint:** clear oxlint findings ([4904bbc](https://github.com/digitalmaas/vue-social-auth/commit/4904bbc4a278ac72f3cef3250f8ddf1898da1b20))
* **oauth2:** always send state, and reject a constant state value ([e336c9b](https://github.com/digitalmaas/vue-social-auth/commit/e336c9b75706fd19f49083e62ba447a6a88c3d07))
* **pkg:** point main at an entry point that is actually built ([e82f3c5](https://github.com/digitalmaas/vue-social-auth/commit/e82f3c5d7ed59763660d5ace76da42230d412a1b))
* **types:** normalize takeItem return to string | undefined ([69c294e](https://github.com/digitalmaas/vue-social-auth/commit/69c294e92eebb1458f0fd1b3f17d93d457782d4d))

### Reverts

* drop tokenEndpoint defaults; explain PKCE flows ([7db7487](https://github.com/digitalmaas/vue-social-auth/commit/7db7487367a405a4fabf0f738cd587528691ce5f))

### Refactoring

* drop localStorage backend ([c5f9cf3](https://github.com/digitalmaas/vue-social-auth/commit/c5f9cf3e8208ba27b3fe4140411755ed7517bb36))
* scope storage per flow, drop dead code, raise the test seam ([c5a4d19](https://github.com/digitalmaas/vue-social-auth/commit/c5a4d193cab6961f77ba04b2f9077af90f49fe05))
* sessionStorage-only with delete-on-read semantics ([094b356](https://github.com/digitalmaas/vue-social-auth/commit/094b356fadb4f24338d12796f53272567a5e1758))

## [Unreleased]

First release is not yet published, so the breaking changes below are listed for
the record rather than as a migration burden.

### Added

- `postMessage` channel for returning the authorization result, enabling
  callback pages hosted on a different origin from the app. Same-origin polling
  is retained as a fallback, so a same-origin callback needs no callback page.
- `@digitalmaas/vue-social-auth/callback` entry point exporting
  `postAuthorizationResult()`, for the page hosted at the redirect URI. Separate,
  framework-free bundle (~2 kB).
- `popupTimeoutMs` provider option (default 5 minutes). Every flow now has a
  bounded lifetime.
- `SocialAuthError` with a `code` to branch on, plus structured `providerError`,
  `providerErrorDescription` and `status` fields.
- `npm run verify:package`, wired into `prepublishOnly`, asserting every path
  declared in `package.json` exists after a build.
- CI workflow: lint, format check, typecheck, dual-Vue test matrix, and a build
  with package verification.

### Changed

- PKCE now defaults to **on** for the direct token-endpoint flow (`tokenEndpoint`
  set, no `url`), where the browser redeems the code itself and is therefore a
  public client — the case
  [draft-ietf-oauth-browser-based-apps](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
  is most emphatic about. It stays **off** by default for the backend-exchange
  flow (`url`), because enabling it there changes a contract this library does
  not own: the backend must forward `codeVerifier` to the provider, and one that
  does not would begin failing with `invalid_grant`. Opting in is recommended
  and documented, including the backend steps it requires. Set `pkce` explicitly
  to override either default.
- **Breaking:** `state` on a provider config no longer accepts a constant
  string. Pass a function (called once per flow) or omit it for a generated
  value. A constant satisfies every check the library can make while providing
  none of the protection `state` exists for.
- **Breaking:** URL fragment parameters are no longer merged into the result, so
  an implicit-flow `access_token` is never returned.
- Provider-supplied `error_description` is no longer interpolated into
  `Error.message`; it is exposed as a structured field instead.
- Preset `redirectUri` values are resolved when `authenticate()` runs rather
  than at module load, so importing the library without a `window` no longer
  bakes an empty origin into every preset.

### Removed

- The `$auth` Vue prototype property from the base libraries. Use
  `useSocialAuth()` in `setup()`, or the `$socialAuth` global property the
  plugin registers.
- The `twitter`, `bitbucket`, `linkedin`, and `live` provider presets.
  Configure such providers under a custom key with their endpoints spelled
  out.

### Fixed

- Every pre-flight configuration failure now throws `SocialAuthError` with code
  `config` rather than a plain `Error`, including two cases that were not
  detected at all: a `state` pinned to a constant string (a JS caller has no
  type system to stop them) and `pkce: true` with neither `url` nor
  `tokenEndpoint`, which would have destroyed the verifier and returned a code
  that could never be exchanged.
- A `postMessage` envelope whose `params` was `null` threw out of the message
  listener and left the flow to hang until the timeout.
- A provider denial that omits `state` on the error redirect is now surfaced
  immediately instead of sitting until the timeout.
- The popup window name is per-flow. It was the provider name, so a second
  concurrent flow re-navigated the first flow's popup instead of opening its
  own.
- `window.open` throwing (rather than returning `null`) left the message
  listener attached.
- `postAuthorizationResult` rejects a `targetOrigin` that is not an exact
  origin, so `'*'` cannot be passed by accident.
- Abandoned flows no longer leak `sessionStorage` entries: because keys are
  scoped per flow, nothing would otherwise collect them. Each flow records an
  expiry and later flows sweep expired ones.
- A custom (non-preset) provider key never sent a `state` parameter, so every
  flow failed verification with "OAuth state mismatch — possible CSRF". `state`
  is now sent unconditionally for every provider.
- A cross-origin callback caused the flow to hang forever: the promise never
  settled and the poll interval ran for the life of the tab, leaving `state` and
  `code_verifier` in `sessionStorage`.
- `main` pointed at `./dist/index.cjs`, which the build never emitted, so any
  CommonJS consumer resolved a missing file.
- Two concurrent `authenticate()` calls for the same provider overwrote each
  other's stored state; storage keys are now scoped per flow.
- The PKCE pair is generated before anything is written to storage, so a
  `crypto.subtle` failure in a non-secure context no longer orphans a stored
  `state`.
