import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
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
    build: { rollupOptions: { input: { main: resolve('src/renderer/index.html'), workbench: resolve('src/renderer/workbench.html') } } },
    plugins: [react(), tailwindcss()]
  }
})
