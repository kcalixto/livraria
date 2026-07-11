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
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_API_KEY: 'test-key',
    },
  },
})
