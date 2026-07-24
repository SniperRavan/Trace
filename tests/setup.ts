import { vi, beforeEach } from 'vitest'

// Simple mock of Chrome APIs to avoid CommonJS/ESM compatibility bugs in vitest-chrome
const mockLocalStorage: Record<string, any> = {}

const storageMock = {
  get: vi.fn().mockImplementation((key?: string | string[] | Record<string, any>) => {
    if (!key) return Promise.resolve(mockLocalStorage)
    if (typeof key === 'string') {
      return Promise.resolve({ [key]: mockLocalStorage[key] })
    }
    if (Array.isArray(key)) {
      const res: Record<string, any> = {}
      key.forEach(k => { res[k] = mockLocalStorage[k] })
      return Promise.resolve(res)
    }
    return Promise.resolve(mockLocalStorage)
  }),
  set: vi.fn().mockImplementation((items: Record<string, any>) => {
    Object.assign(mockLocalStorage, items)
    return Promise.resolve()
  }),
}

const onChangedMock = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
}

const alarmsMock = {
  create: vi.fn(),
  get: vi.fn().mockImplementation(() => Promise.resolve(null)),
  onAlarm: {
    addListener: vi.fn(),
  },
}

global.chrome = {
  storage: {
    local: storageMock,
    onChanged: onChangedMock,
  },
  alarms: alarmsMock,
} as any

if (typeof global.window === 'undefined') {
  const eventListeners: Record<string, Function[]> = {}
  global.window = {
    addEventListener: vi.fn().mockImplementation((type: string, fn: Function) => {
      if (!eventListeners[type]) eventListeners[type] = []
      eventListeners[type].push(fn)
    }),
    removeEventListener: vi.fn().mockImplementation((type: string, fn: Function) => {
      if (eventListeners[type]) {
        eventListeners[type] = eventListeners[type].filter(f => f !== fn)
      }
    }),
    dispatchEvent: vi.fn().mockImplementation((event: any) => {
      const type = event.type || (event.data ? 'message' : '')
      if (eventListeners[type]) {
        eventListeners[type].forEach(fn => fn(event))
      }
      return true
    }),
  } as any
}

beforeEach(() => {
  storageMock.get.mockClear()
  storageMock.set.mockClear()
  onChangedMock.addListener.mockClear()
  alarmsMock.create.mockClear()
  // Clear fake local storage
  for (const key in mockLocalStorage) {
    delete mockLocalStorage[key]
  }
})

