# GitHub Actions builds

Two workflows build Windows x64 NSIS installers with a private CPU Python environment and CPU llama.cpp. End users do not need to install Python. GPU dependencies remain managed by the application. Model weights are not bundled.

- `build.yml`: every branch push, pull request, or manual run. Download the installer from the run's **Artifacts** section. Development versions use `package version-dev.run number`. Artifacts expire after 14 days; newer runs cancel older builds on the same branch/PR.
- `release.yml`: push a version tag such as `v0.1.5`, or publish a GitHub Release for an existing version tag. The workflow checks out that tag and sets the installer version from it. It creates a Release if needed and uploads the installer plus SHA-256 checksums. Tags such as `v0.1.6-rc.1` create prereleases.

Example:

```powershell
git tag v0.1.5
git push origin v0.1.5
```

Enable GitHub Actions in the repository. No personal access token is needed: release publishing uses `GITHUB_TOKEN` with `contents: write`. These installers are unsigned. Fork PR builds receive read-only permissions and never publish Releases.

Commit `package-lock.json`, `build/icon.ico`, the runtime catalogs, all referenced build scripts, and the engine sources before pushing. CPU dependency imports are checked during packaging. Pip and npm caches accelerate subsequent builds; generated Python environments are rebuilt for each checkout.

The reference project's tag-triggered Release workflow informed the trigger/publish split:
https://github.com/Xavier-MC/XavierChatSync/blob/master/.github/workflows/release.yml
