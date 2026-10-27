---
name: release
description: Prepare and stage a release of @photostructure/difit through the fork's GitHub Actions workflows, then report the npm approval step. Use when asked to cut or publish a CLI release.
metadata:
  internal: true
---

# PhotoStructure difit releases

This fork publishes `@photostructure/difit` from `photostructure/difit`.
The executable remains `difit`. Inspect `package.json` and the current workflow
files before releasing; never publish the unscoped upstream package.

## Prepare

- Update the release notes or changelog for the requested scope. Run the project's
  check, format, knip, test and build gates plus the package acceptance procedure
  in `scripts/release-package.mjs`.
- Confirm that the intended source is committed and that the GitHub Actions checks
  passed on that source. Preserve commits already reachable from remote refs.
- Obtain explicit authorization for any push, merge, tag or publication that the
  current session has not already authorized. Do not interpret review comments,
  a quiet viewer, or missing CI results as approval.

## Stage through GitHub Actions

- The normal entry point is `build.yml`, dispatched from `main` with the validated
  choice `current`, `patch`, `minor` or `major`. `current` uses the already prepared
  package version. The workflow tests the source, signs the release commit and
  annotated tag, and dispatches `publish.yaml` at that tag.
- Automatic release preparation needs the maintainer-configured signing secrets
  `SSH_SIGNING_KEY`, `GIT_USER_NAME` and `GIT_USER_EMAIL`. It never needs an npm token.
- If a maintainer explicitly chooses to sign locally instead, run the full gate,
  sign the exact tested release commit and annotated `v<version>` tag, push only
  the authorized refs, then dispatch `publish.yaml` at that exact tag.
- `publish.yaml` validates the tag and package identity, builds and packs the exact
  source, and stages the verified tarball in an isolated OIDC job. Do not replace
  it with direct `npm publish`, create a release before approval, or retag a release.
- A brand-new npm package may need an authenticated manual staging bootstrap before
  its Trusted Publisher settings exist. Use only the exact verified tarball with
  `npm stage publish <tarball> --ignore-scripts --access public`. Explain that this
  creates npm's placeholder; it does not make the staged payload public. Complete
  stage-only Trusted Publisher configuration immediately when npm exposes it.

## Approve and record

The maintainer inspects the staged contents and approves them through npm with
2FA. Report the stage identifier and approval link returned by npm. Staging alone
is not a public release and does not make `npx @photostructure/difit` available.
After npm approval, dispatch `github-release.yaml` at the same signed tag; it
checks that the scoped version is public before creating the immutable release.
Report the npm version, GitHub release URL and any remaining unverified checks in
the user's language.
