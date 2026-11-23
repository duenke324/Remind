import { defineConfig, devices } from '@playwright/test'

// Localmente pode usar-se um Chromium já instalado (PW_CHROMIUM_PATH); na CI usa o do Playwright.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] } } },
    { name: 'telemovel', use: { ...devices['Pixel 7'], launchOptions: { executablePath } } },
    { name: 'iphone', use: { ...devices['iPhone 14 Pro'], defaultBrowserType: 'chromium', launchOptions: { executablePath } } }
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI
  }
})
