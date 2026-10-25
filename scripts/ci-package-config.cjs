// Build config is generated in CI, leaving local development packaging intact.
const fs = require('node:fs')
const { build } = JSON.parse(fs.readFileSync('package.json', 'utf8'))

/*
 * electron-builder only logs a warning for an extraResources source that does not exist and
 * packs the application without it, so a missing runtime would reach the installer unnoticed.
 * The sources are checked here, where a missing one still stops the build.
 */
const missingSources = (build.extraResources ?? [])
  .filter(resource => typeof resource.from === 'string' && !fs.existsSync(resource.from))
if (missingSources.length > 0) {
  for (const resource of missingSources) console.error(`Missing extraResources source: ${resource.from} -> ${resource.to}`)
  process.exit(1)
}

const config = {
  ...build,
  electronDist: null,
  win: {
    ...build.win,
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
    artifactName: 'Nola-Translator-${version}-Windows-${arch}-Setup.${ext}',
  },
  nsis: { ...build.nsis, buildUniversalInstaller: false },
}
fs.mkdirSync('artifacts', { recursive: true })
fs.writeFileSync('artifacts/ci-builder.json', JSON.stringify(config, null, 2))
