# Contributing

## Your commit message sets the version number

This project releases automatically. There is no release meeting, no version bump
commit, and nobody deciding what the next version is. It is computed from the
commit messages that landed since the last release.

That means **your commit message is part of the public API of this repository**.
Reviewing a pull request here includes reviewing what its commits will do to the
version number.

Messages follow [Conventional Commits](https://www.conventionalcommits.org/) and
are linted by [commitlint](https://commitlint.js.org/) on the `commit-msg` hook
and again in CI.

### Type → release

| Type       | Release   | Use for                                          |
| ---------- | --------- | ------------------------------------------------ |
| `feat`     | **minor** | New capability a consumer can use.               |
| `fix`      | **patch** | A defect a consumer could hit.                   |
| `perf`     | patch     | Faster or lighter, same behaviour.               |
| `refactor` | patch     | Internal restructuring with no behaviour change. |
| `revert`   | patch     | Undoing an earlier change.                       |
| `docs`     | none      | README, comments, this file.                     |
| `test`     | none      | Tests only.                                      |
| `chore`    | none      | Tooling, CI, dependencies.                       |

Anything marked **breaking** produces a **major** release regardless of type.

### Declaring a breaking change

A breaking change needs **both** a `!` after the type/scope **and** a
`BREAKING CHANGE:` footer explaining it. commitlint rejects a commit that has one
without the other.

```
feat(popup)!: return results over postMessage

The popup no longer resolves by polling its location, so a cross-origin
callback must host a page calling postAuthorizationResult().

BREAKING CHANGE: a callback URI on a different origin from the app now
requires a callback page. Same-origin callbacks are unaffected.
```

The footer is what consumers read when deciding whether to upgrade. Write it for
them — say what breaks and what to do about it, not what you changed.

### What counts as breaking

More than you might think, for a library:

- Removing or renaming anything exported.
- Narrowing a type, or making an optional parameter required.
- Changing a **default value** — a consumer who never set the option still gets
  different behaviour.
- Changing what an error's `code` is, or when it is thrown.
- Requiring a newer Node, npm, or Vue version.
- Changing the shape of a network request the consumer's backend receives.

Those last two are easy to miss. Enabling PKCE by default on a flow, for example,
adds a field the consumer's backend must handle — nothing in this repository
changed shape, but their integration breaks.

### The limit of the tooling, stated plainly

commitlint checks that a breaking change is declared _consistently_. The release
tooling honours a declaration when it sees one. **Neither can detect a breaking
change you did not declare.** A `fix:` that quietly changes behaviour ships as a
patch straight into everyone's `^` range.

There is no automated defence against that. It is a review responsibility.

## Before you open a pull request

```sh
npm run check   # lint, format, typecheck
npm test        # unit + integration, on both Vue 2.7 and Vue 3
```

Both run in CI too, along with a build and a release dry-run.

Tests live in `test/unit` (pure functions) and `test/integration` (the real flow,
with only `window.open` and `fetch` stubbed). Prefer the integration seam: it is
the highest one available, and it is where the interesting behaviour lives.

## Release branches

- `next` — where work lands. Pushing here publishes a prerelease to the `next`
  dist-tag.
- `main` — stable. Merging `next` into `main` promotes the accumulated work to a
  stable release.

Target your pull request at `next` unless you are fixing something already
released.
