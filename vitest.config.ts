import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // tailwindcss() 在这里不是多余的：单测要真的渲染带 Tailwind 类名的组件，
  // `css: true` 只让 vitest 处理 CSS 导入，Tailwind 插件负责真正生成规则。
  // 少它的话组件能渲染、断言能跑，但产物里一个 `.bg-red-500` 都没有。
  plugins: [react(), tailwindcss()],
  resolve: {
    // 与 electron.vite.config.ts 保持一致 —— Vite 不读 tsconfig 的 paths。
    alias: {
      '@renderer': resolve('src/renderer'),
      '@': resolve('src/renderer')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // 渲染层自带的单测跟着新 UI 一起搬过来了，位置在 `src/renderer/**` 下。
    include: ['tests/unit/**/*.test.{ts,tsx}', 'src/renderer/**/*.test.{ts,tsx}', 'src/shared/**/*.test.{ts,tsx}'],
    css: true
  }
})
