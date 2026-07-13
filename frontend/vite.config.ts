/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// CSP via <meta> SÓ no build: o site é servido do S3 (sem headers custom) e
// o dev server precisa de HMR/inline que a política bloquearia.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self' https://*.execute-api.sa-east-1.amazonaws.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

function cspOnBuild(): Plugin {
  return {
    name: 'csp-on-build',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspOnBuild()],
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
      // datas exibidas são locais: fixa o fuso pra suite não depender da máquina
      TZ: 'America/Sao_Paulo',
    },
  },
})
