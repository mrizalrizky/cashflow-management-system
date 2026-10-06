import { defineConfig, devices } from '@playwright/test'
import { API_DIR, API_PORT, apiEnv, WEB_PORT } from './e2e/env'

const API_URL = `http://localhost:${API_PORT}`
const WEB_URL = `http://localhost:${WEB_PORT}`

export default defineConfig({
  testDir: './e2e',
  // Satu alur berurutan terhadap satu database, jadi tidak dijalankan paralel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Build ke folder sendiri: `dist` dipakai server pengembangan yang mungkin sedang jalan.
      command:
        'npx nest build -p tsconfig.browser-test.json && node dist-browser-test/main.js',
      cwd: API_DIR,
      env: apiEnv,
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      env: { API_PROXY_TARGET: API_URL },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
