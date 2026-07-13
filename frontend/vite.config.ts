/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
    // suíte grande em paralelo estoura os 5s default em máquina carregada
    testTimeout: 15000,
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_API_KEY: 'test-key',
      VITE_STAGE: 'dev',
    },
  },
})
