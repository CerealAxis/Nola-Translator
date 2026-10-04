# GitHub Actions builds

Two workflows build separate Windows x64 EXE (NSIS) and MSI installers, plus a source ZIP. End users do not need to install Python. GPU dependencies remain managed by the application. Model weights are not bundled.

- `build.yml`: every branch push, pull request, or manual run. Download the installer from the run's **Artifacts** section. Development versions use `package version-dev.run number`. Artifacts expire after 14 days; newer runs cancel older builds on the same branch/PR.
- `release.yml`: push a version tag such as `v0.1.5`, or publish a GitHub Release for an existing version tag. The workflow checks out that tag and sets the installer version from it. It creates a Release if needed and uploads all three files. Tags such as `v0.1.6-rc.1` create prereleases.

For version `0.1.5`, the downloads are:

- `Nola-Translator-0.1.5-Windows-x64-Setup.exe`
- `Nola-Translator-0.1.5-Windows-x64-Setup.msi`
- `Nola-Translator-0.1.5-Source.zip`

Actions uploads each file separately without an additional ZIP wrapper. Development filenames use the development version, for example `0.1.5-dev.2`, without a full commit hash. SHA-256 values are listed in the run summary. The source archive comes from the checked-out Git commit, excluding generated runtimes and model weights; the CI-only package version change is not included. GitHub Releases also display GitHub's automatic source archives.

Example:

```powershell
git tag v0.1.5
git push origin v0.1.5
```

Enable GitHub Actions in the repository. No personal access token is needed: release publishing uses `GITHUB_TOKEN` with `contents: write`. These installers are unsigned. Fork PR builds receive read-only permissions and never publish Releases.

Commit `package-lock.json`, `build/icon.ico`, the runtime catalogs, all referenced build scripts, and the engine sources before pushing. CPU dependency imports are checked during packaging. Pip and npm caches accelerate subsequent builds; generated Python environments are rebuilt for each checkout.

The build script explicitly runs Electron's binary installer and checks its version before building. This supports clean runners where npm lifecycle policy does not run Electron's postinstall; a matching existing binary is reused.

The reference project's tag-triggered Release workflow informed the trigger/publish split:
https://github.com/Xavier-MC/XavierChatSync/blob/master/.github/workflows/release.yml
