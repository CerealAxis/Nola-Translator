// Build config is generated in CI, leaving local development packaging intact.
const fs = require('node:fs')
const { build } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const config = {
  ...build,
  electronDist: null,
  win: {
    ...build.win,
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'msi', arch: ['x64'] },
    ],
    artifactName: 'Nola-Translator-${version}-Windows-${arch}-Setup.${ext}',
  },
  nsis: { ...build.nsis, buildUniversalInstaller: false },
  msi: { oneClick: false, perMachine: false, createDesktopShortcut: true, createStartMenuShortcut: true },
}
fs.mkdirSync('artifacts', { recursive: true })
fs.writeFileSync('artifacts/ci-builder.json', JSON.stringify(config, null, 2))
