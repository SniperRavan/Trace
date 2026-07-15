import { vi, beforeEach } from 'vitest'
import { chrome } from 'vitest-chrome'

// Globally mock the chrome extension API
global.chrome = chrome as any

beforeEach(() => {
  chrome.storage.local.get.mockClear()
  chrome.storage.local.set.mockClear()
  chrome.alarms.create.mockClear()
})
