# GitHub Actions builds

Two workflows build separate Windows x64 EXE (NSIS) and MSI installers, plus a source ZIP. End users do not need to install Python. GPU dependencies remain managed by the application. Model weights are not bundled.

`npm run dist:win` also builds both EXE and MSI installers locally. The EXE embeds a ZIP payload and extracts it directly into the installation directory instead of extracting and copying a temporary application tree. It remains an offline NSIS installer; the ZIP is an internal build artifact, not a portable download. Differential NSIS packages are disabled to keep the payload format and extraction plugin consistent. After installation, the embedded temporary ZIP is deleted before the finish page, and NSIS cleans up the remaining plugin temporary directory when the installer exits. MSI continues to use Windows Installer packaging.

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

Local CPU runtime builds require the standard Windows x64 CPython 3.13 layout. Conda keeps some native dependencies under `Library/bin`, which this relocatable runtime builder does not copy. When preparing a new CPU build environment, pass a standard interpreter with `./scripts/build-cpu-engine.ps1 -BasePython <path-to-python.exe>`; GitHub Actions already supplies standard CPython through `actions/setup-python`.

The build script explicitly runs Electron's binary installer and checks its version before building. This supports clean runners where npm lifecycle policy does not run Electron's postinstall; a matching existing binary is reused.

The private runtime flattens nested dependency license files inside each `.dist-info/licenses` directory to avoid WiX legacy path limits. All notice contents are preserved, `original-paths.json` maps filenames to original paths, and package `RECORD` entries are updated. Installed dependency environments are not modified.

The reference project's tag-triggered Release workflow informed the trigger/publish split:
https://github.com/Xavier-MC/XavierChatSync/blob/master/.github/workflows/release.yml
