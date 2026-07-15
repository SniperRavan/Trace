import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import path from 'path'

let context: BrowserContext

test.beforeAll(async () => {
  const pathToExtension = path.join(__dirname, '../dist')
  
  context = await chromium.launchPersistentContext('', {
    headless: false, // Extensions can only run in headful mode in Chromium
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  })
})

test.afterAll(async () => {
  if (context) await context.close()
})

test('should compile and load the extension successfully', async () => {
  // Extract background page service worker
  let [background] = context.serviceWorkers()
  if (!background) {
    background = await context.waitForEvent('serviceworker')
  }
  
  expect(background.url()).toContain('background/index.js')
})
