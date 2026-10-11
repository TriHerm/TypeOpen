# Releasing TypeOpen on macOS

TypeOpen can produce a locally distributable ad-hoc signed DMG without paid Apple credentials. Public releases that should pass Gatekeeper without an override require a Developer ID Application certificate and Apple notarization.

## Local Apple Silicon release

From a clean checkout:

```bash
npm ci
npm run verify
npm run dmg
npm run verify:dist
```

`npm run dmg` removes stale release artifacts, builds the production Vite renderer, compiles the Apple Silicon Swift/AppKit shell, ad-hoc signs `release/native-arm64/TypeOpen.app`, and creates `release/TypeOpen-<version>-arm64.dmg`.

`npm run verify:dist` checks all of the following:

- the packaged application exists and has an ad-hoc signature;
- the executable contains the expected Apple Silicon architecture;
- the DMG checksum is valid and the image mounts read-only;
- the mounted application passes the same signature and architecture checks;
- the native bundle contains the production renderer and native bridge;
- the native bundle contains no Electron Framework, `app.asar`, `Typora.app`, or `.rea-evidence` material;
- the packaged and mounted applications use the bundle identifier declared in `package.json`;
- the final DMG SHA-256 digest is printed for release notes.

The Electron shell is retained temporarily for migration comparison. Its package commands are explicitly named `pack:electron`, `dmg:electron`, and `dmg:electron:universal`; they are not used by the default release procedure.

## Developer ID release

For a Gatekeeper-friendly public release, configure signing and notarization credentials outside the repository. Do not commit certificates, private keys, passwords or notarization profiles.

The repository includes `.env.example` only as a reminder of the expected secret categories. Release credentials belong in the local keychain or the secret store of the CI system used to publish the release.

After signing and notarization, verify the final application and DMG with Apple's `codesign`, `spctl`, `notarytool` and `stapler` commands before publishing.

## Homebrew distribution

The current public `v0.1.5` release is Apple Silicon-only, ad-hoc signed, and not notarized. It therefore does not meet the Gatekeeper requirement for the official `homebrew/cask` repository. The appropriate interim distribution path is a TriHerm-maintained third-party tap.

The reviewable cask and tap layout are maintained under [`packaging/homebrew-tap`](../packaging/homebrew-tap/README.md) and published to `TriHerm/homebrew-tap`, which users install from as `triherm/tap/typeopen`.

After building the immutable release DMG, run `npm run homebrew:sync` to update the staged cask version and SHA-256 from `package.json` and the exact local artifact. Audit that cask before copying it into the public tap; do not hand-edit a checksum to make a mismatched artifact pass.

Do not disable Homebrew quarantine in the cask. Until a Developer ID signed and notarized build exists, users may need to approve TypeOpen through macOS **System Settings > Privacy & Security > Open Anyway** after the first blocked launch.
