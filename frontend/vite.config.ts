import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const frontendDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendDirectory, 'VITE_')

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL ?? 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
