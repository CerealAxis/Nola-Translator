import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

async function prepareWindowsDevElectron() {
  const source: string = createRequire(import.meta.url)('electron')
  const icon = readFileSync(resolve('build/icon.ico'))
  const { size, mtimeMs } = statSync(source)
  const fingerprint = createHash('sha256').update(icon).update(`${source}:${size}:${mtimeMs}`).digest('hex').slice(0, 16)
  const cache = resolve('node_modules/.cache/nola-electron')
  const directory = join(cache, fingerprint)
  const executable = join(directory, basename(source))
  if (!existsSync(executable)) {
    const { Data, NtExecutable, NtExecutableResource, Resource } = await import('resedit')
    const binary = NtExecutable.from(readFileSync(source), { ignoreCert: true })
    const resources = NtExecutableResource.from(binary)
    const icons = Data.IconFile.from(icon).icons.map(item => item.data)
    const groups = resources.entries.filter(entry => entry.type === 14)
    for (const { id, lang } of groups) {
      Resource.IconGroupEntry.replaceIconsForResource(resources.entries, id, lang, icons)
    }
    resources.outputResource(binary)

    mkdirSync(cache, { recursive: true })
    const staging = mkdtempSync(join(cache, 'staging-'))
    try {
      // Keep electron.exe and its sibling resources so Electron still runs in development mode.
      cpSync(dirname(source), staging, { recursive: true, filter: path => path !== source })
      writeFileSync(join(staging, basename(source)), Buffer.from(binary.generate()))
      renameSync(staging, directory)
    } catch (error) {
      if (!existsSync(executable)) throw error
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  }
  process.env.ELECTRON_EXEC_PATH = executable
}

const config = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  // 注意：不要动这一段的 `format: 'cjs'` / `entryFileNames: '[name].cjs'`。
  // `src/main/window-options.ts:6` 依赖 preload 产物就叫 `index.cjs`。
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        // `@renderer` 是主仓原有的；`@` 是新 UI 带来的。
        // **两处（这里与 vitest.config.ts）都要声明** —— Vite 不读 tsconfig 的 paths，
        // 只配 tsconfig 的话 tsc 能过但 vite dev / vitest 全部解析失败。
        '@renderer': resolve('src/renderer'),
        '@': resolve('src/renderer')
      }
    },
    // Base UI components use the existing Tailwind pipeline and product theme cascade.
    // Caption windows share index.html; the standalone agent workbench has its own document.
    build: { rollupOptions: { input: { main: resolve('src/renderer/index.html'), workbench: resolve('src/renderer/workbench.html'), onboardingCard: resolve('src/renderer/onboarding-card.html'), latency: resolve('src/renderer/latency.html') } } },
    plugins: [react(), tailwindcss()]
  }
})

export default defineConfig(async ({ command }) => {
  if (command === 'serve' && process.platform === 'win32' && !process.env.ELECTRON_EXEC_PATH) {
    await prepareWindowsDevElectron()
  }
  return config
})
