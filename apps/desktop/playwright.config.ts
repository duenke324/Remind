import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // Um de cada vez: cada teste abre uma app Electron inteira (e o servidor).
  // Em paralelo, na CI, dois arranques ao mesmo tempo deram 'spawn ETXTBSY'.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list'
})
