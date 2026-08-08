/* 
 * src/content/interceptor.ts
 *
 * MAIN-world transport interceptor (fetch, XHR, WebSocket).
 * Captures server-reported usage metrics, active models, plan indicators,
 * and rate-limit headers. Dispatches sanitized events across world boundaries.
 *
 * Security & Integrity:
 * - Session nonce generated per page lifecycle
 * - Deterministic eventId computed per request for idempotent deduplication
 * - Defensive stream reading (checks bodyUsed, handles exceptions)
 * - Safe response cloning with fallbacks
 */

; (function() {
  const DEBUG = true
  const TRACE_MARKER = '__TRACE_EXTENSION__'
  const SESSION_NONCE = Math.random().toString(36).slice(2) + Date.now().toString(36)
  
  let requestCounter = 0
  const originalFetch = window.fetch
  const XHR = window.XMLHttpRequest
  const origOpen = XHR.prototype.open
  const origSend = XHR.prototype.send

  function log(...args: unknown[]) {
    if (DEBUG) console.log('[Trace:Interceptor]', ...args)
  }

  function resolveUrl(url: string): string {
    try { return new URL(url, location.href).href } catch { return url }
  }

  function isProviderUrl(url: string): boolean {
    return (
      url.includes('claude.ai') ||
      url.includes('chatgpt.com') || url.includes('chat.openai.com') ||
      url.includes('gemini.google.com') ||
      url.includes('perplexity.ai') ||
      url.includes('grok.com') || url.includes('x.com') ||
      url.includes('deepseek.com')
    )
  }

  /**
   * Generates a fast deterministic event identifier for idempotency.
   */
  function createEventId(provider: string, reqId: string | number, eventType: string = 'msg'): string {
    const raw = `${provider}|${reqId}|${eventType}|${location.pathname}`
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i)
      hash |= 0
    }
    return `${provider}-${Math.abs(hash).toString(16)}`
  }

  function dispatch(provider: string, payload: Record<string, unknown>) {
    const eventId = (payload.eventId as string) || createEventId(provider, ++requestCounter)
    const detail = {
      provider,
      nonce: SESSION_NONCE,
      eventId,
      ...payload,
    }

    try {
      const targetOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'
      window.postMessage({
        source: TRACE_MARKER,
        type: 'trace:tokens',
        detail,
      }, targetOrigin)
    } catch (e) {
      log('postMessage dispatch error', e)
    }

    try {
      window.dispatchEvent(new CustomEvent('trace:tokens', { detail }))
    } catch (e) {
      log('CustomEvent dispatch error', e)
    }
  }

  function parseSSELines(buffer: string, onLine: (line: string) => void): string {
    const lines = buffer.split('\n')
    const rest = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data:')) {
        onLine(trimmed.slice(5).trim())
      }
    }
    return rest
  }

  async function readSSE(response: Response, onLine: (line: string) => void): Promise<boolean> {
    let sawData = false
    try {
      if (response.bodyUsed) return false
      const reader = response.body?.getReader()
      if (!reader) return sawData
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = parseSSELines(buffer, (line) => {
          sawData = true
          onLine(line)
        })
      }
    } catch (e) {
      log('readSSE error', e)
    }
    return sawData
  }

  function handleRateLimitError(provider: 'claude' | 'chatgpt' | 'gemini', response: Response) {
    if (response.status !== 429) return

    const retryAfter = response.headers.get('retry-after') || response.headers.get('x-ratelimit-reset-requests')
    let resetAtMs: number | undefined
    if (retryAfter) {
      const seconds = parseFloat(retryAfter)
      if (!isNaN(seconds)) {
        resetAtMs = Date.now() + (seconds * 1000)
      } else {
        const parsedDate = Date.parse(retryAfter)
        if (!isNaN(parsedDate)) resetAtMs = parsedDate
      }
    }

    response.clone().json().then((errorData) => {
      if (provider === 'claude') {
        let limitDetails: any = null
        if (errorData?.type === 'error' && errorData?.error?.message) {
          try { limitDetails = JSON.parse(errorData.error.message) } catch {}
        }
        const resetsAtStr = limitDetails?.resetsAt || limitDetails?.resets_at || errorData?.resets_at
        if (resetsAtStr) resetAtMs = new Date(resetsAtStr).getTime()
        dispatch('claude', { isExactUsage: true, sessionPct: 100, resetAtMs: resetAtMs || (Date.now() + 5 * 3600 * 1000) })
      } else if (provider === 'chatgpt') {
        const resetSeconds = errorData?.cleared_in || errorData?.reset_in
        if (resetSeconds && typeof resetSeconds === 'number') {
          resetAtMs = Date.now() + (resetSeconds * 1000)
        }
        dispatch('chatgpt', { sessionPct: 100, resetAtMs: resetAtMs || (Date.now() + 3 * 3600 * 1000) })
      } else if (provider === 'gemini') {
        dispatch('gemini', { sessionPct: 100, resetAtMs: resetAtMs || (Date.now() + 4 * 3600 * 1000) })
      }
    }).catch(() => {
      dispatch(provider, { sessionPct: 100, resetAtMs: resetAtMs || (Date.now() + 4 * 3600 * 1000) })
    })
  }

  // ════════════════════════════════════════════════════════════════
  // ChatGPT (OpenAI)
  // ════════════════════════════════════════════════════════════════
  function extractChatGPTRequestText(body: unknown): { userText: string; modelName: string } {
    let userText = ''
    let modelName = 'GPT-4o'
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body
      if (parsed?.model) {
        if (parsed.model.includes('o3-mini')) modelName = 'o3-mini'
        else if (parsed.model.includes('o1')) modelName = 'o1'
        else if (parsed.model.includes('gpt-4o-mini')) modelName = 'GPT-4o mini'
        else if (parsed.model.includes('gpt-4o')) modelName = 'GPT-4o'
      }
      const messages = (parsed as any)?.messages
      if (Array.isArray(messages)) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i]
          if (m?.author?.role === 'user') {
            if (Array.isArray(m?.content?.parts)) {
              userText = m.content.parts.filter((p: unknown) => typeof p === 'string').join(' ')
              break
            }
            if (typeof m?.content === 'string') {
              userText = m.content
              break
            }
          }
        }
      }
    } catch {}
    return { userText, modelName }
  }

  function extractTextDeep(node: unknown, depth = 0): string {
    if (depth > 5 || !node) return ''
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(n => extractTextDeep(n, depth + 1)).join('')
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>
      if (typeof obj.text === 'string') return obj.text
      if (Array.isArray(obj.parts)) return extractTextDeep(obj.parts, depth + 1)
      if (typeof obj.v === 'string') return obj.v
      if (typeof obj.value === 'string') return obj.value
    }
    return ''
  }

  function handleChatGPTFetch(response: Response, body: unknown) {
    const { userText, modelName } = extractChatGPTRequestText(body)
    let assistantText = ''
    let lineCount = 0
    let lastDispatchedLength = 0
    const reqId = ++requestCounter
    const eventId = createEventId('chatgpt', reqId)

    let clone: Response
    try {
      clone = response.clone()
    } catch {
      return
    }

    readSSE(clone, (raw) => {
      lineCount++
      if (raw === '[DONE]') return
      try {
        const d = JSON.parse(raw)
        if (d?.message?.author?.role === 'assistant') {
          const t = extractTextDeep(d.message?.content?.parts)
          if (t && t.length > assistantText.length) assistantText = t
        } else if (d?.v) {
          const t = extractTextDeep(d.v)
          if (t) {
            if (typeof d.v === 'string') assistantText += d.v
            else if (t.length > assistantText.length) assistantText = t
          }
        }
        if (assistantText.length - lastDispatchedLength > 50 || lineCount % 12 === 0) {
          lastDispatchedLength = assistantText.length
          dispatch('chatgpt', {
            eventId,
            userText,
            assistantText,
            modelName,
            contextLimit: 128000,
            source: 'tokenizer',
            confidence: 'estimated',
            isStreaming: true,
          })
        }
      } catch {}
    }).then(() => {
      if (userText || assistantText) {
        dispatch('chatgpt', {
          eventId,
          userText,
          assistantText,
          modelName,
          contextLimit: 128000,
          source: 'tokenizer',
          confidence: 'estimated',
          isStreaming: false,
        })
      }
    })
  }

  // ════════════════════════════════════════════════════════════════
  // Claude (Anthropic)
  // ════════════════════════════════════════════════════════════════
  function extractClaudeRequestText(body: unknown): { userText: string; modelName: string } {
    let userText = ''
    let modelName = 'Sonnet 5'
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body
      if (parsed?.model) {
        const m = String(parsed.model).toLowerCase()
        if (m.includes('sonnet-5') || m.includes('sonnet5') || m.includes('claude-sonnet-5')) modelName = 'Sonnet 5'
        else if (m.includes('3-7') || m.includes('3.7')) modelName = 'Claude 3.7 Sonnet'
        else if (m.includes('haiku')) modelName = 'Claude 3.5 Haiku'
        else if (m.includes('opus')) modelName = 'Claude 3 Opus'
        else if (m.includes('sonnet-3-5') || m.includes('3.5')) modelName = 'Claude 3.5 Sonnet'
      }
      if (typeof (parsed as any)?.prompt === 'string') userText = (parsed as any).prompt
      else if (typeof (parsed as any)?.text === 'string') userText = (parsed as any).text
      else if (Array.isArray((parsed as any)?.messages)) {
        const last = (parsed as any).messages[(parsed as any).messages.length - 1]
        if (typeof last?.content === 'string') userText = last.content
      }
    } catch {}
    return { userText, modelName }
  }

  type ClaudeState = {
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    cacheCreationTokens: number
    reasoningTokens: number
    assistantText: string
    isExact: boolean
  }

  function processClaudeLine(raw: string, state: ClaudeState) {
    try {
      const d = JSON.parse(raw)
      if (d.type === 'message_start' && d.message?.usage) {
        const u = d.message.usage
        state.inputTokens = u.input_tokens ?? 0
        state.outputTokens = u.output_tokens ?? 0
        state.cachedInputTokens = u.cache_read_input_tokens ?? 0
        state.cacheCreationTokens = u.cache_creation_input_tokens ?? 0
        state.isExact = true
      }
      if (d.type === 'message_delta' && d.usage) {
        state.outputTokens = d.usage.output_tokens ?? state.outputTokens
        state.isExact = true
      }
      if (d.type === 'content_block_delta' && d.delta?.text) {
        state.assistantText += d.delta.text
      } else if (typeof d?.delta?.text === 'string') {
        state.assistantText += d.delta.text
      }
    } catch {}
  }

  function handleClaudeFetch(response: Response, body: unknown) {
    const { userText, modelName } = extractClaudeRequestText(body)
    const reqId = ++requestCounter
    const eventId = createEventId('claude', reqId)
    const state: ClaudeState = {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
      assistantText: '',
      isExact: false,
    }

    let clone: Response
    try {
      clone = response.clone()
    } catch {
      return
    }

    readSSE(clone, (raw) => {
      processClaudeLine(raw, state)
    }).then(() => {
      if (state.isExact && (state.inputTokens || state.outputTokens)) {
        dispatch('claude', {
          eventId,
          inputTokens: state.inputTokens,
          outputTokens: state.outputTokens,
          cachedInputTokens: state.cachedInputTokens,
          cacheCreationTokens: state.cacheCreationTokens,
          totalTokens: state.inputTokens + state.outputTokens + state.cacheCreationTokens,
          modelName,
          contextLimit: 200000,
          source: 'server',
          confidence: 'exact',
        })
      } else if (userText || state.assistantText) {
        dispatch('claude', {
          eventId,
          userText,
          assistantText: state.assistantText,
          modelName,
          contextLimit: 200000,
          source: 'heuristic',
          confidence: 'estimated',
        })
      }
    })
  }

  // ════════════════════════════════════════════════════════════════
  // Gemini (Google)
  // ════════════════════════════════════════════════════════════════
  function extractGeminiUserText(body: unknown): string {
    if (!body) return ''
    try {
      const raw = typeof body === 'string' ? body : String(body)
      const decoded = decodeURIComponent(raw)
      const matches = decoded.match(/\["([^"\\]*(?:\\.[^"\\]*)*)"/g)
      if (matches) {
        for (const m of matches) {
          const cleaned = m.slice(2, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"')
          if (cleaned.length > 2 && !cleaned.startsWith('http') && !cleaned.startsWith('c_') && !cleaned.startsWith('boq_')) {
            return cleaned
          }
        }
      }
    } catch {}
    return ''
  }

  function processGeminiText(text: string, userText: string = '', reqId: number) {
    if (!text) return
    const eventId = createEventId('gemini', reqId)
    let lastUsage: { inp: number; out: number; cached?: number } | null = null

    // Exact usageMetadata parser
    const matches = text.matchAll(/\\?"usageMetadata\\?":\s*\\?\{([^}]+)\\?\}/g)
    for (const m of matches) {
      try {
        const unescaped = m[1].replace(/\\"/g, '"')
        const meta = JSON.parse('{' + unescaped + '}')
        const inp = meta.promptTokenCount ?? 0
        const out = meta.candidatesTokenCount ?? 0
        const cached = meta.cachedContentTokenCount ?? 0
        if (inp || out) lastUsage = { inp, out, cached }
      } catch {}
    }

    let modelName = '3.6 Flash'
    let contextLimit = 1000000
    if (text.includes('3.1 Pro') || text.includes('gemini-3.1-pro')) {
      modelName = '3.1 Pro'
      contextLimit = 2000000
    } else if (text.includes('Extended thinking') || text.includes('thinking')) {
      modelName = 'Extended thinking'
      contextLimit = 2000000
    }

    if (lastUsage) {
      dispatch('gemini', {
        eventId,
        inputTokens: lastUsage.inp,
        outputTokens: lastUsage.out,
        cachedInputTokens: lastUsage.cached,
        totalTokens: lastUsage.inp + lastUsage.out,
        modelName,
        contextLimit,
        source: 'server',
        confidence: 'exact',
      })
    } else {
      let assistantText = ''
      const stringMatches = text.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)
      if (stringMatches) {
        for (const sm of stringMatches) {
          const s = sm.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"')
          if (s.length > 20 && !s.startsWith('http') && !s.startsWith('boq_') && !s.startsWith('c_') && !s.includes('batchexecute')) {
            assistantText += ' ' + s
          }
        }
      }
      if (userText || assistantText.length > 10) {
        dispatch('gemini', {
          eventId,
          userText,
          assistantText,
          modelName,
          contextLimit,
          source: 'heuristic',
          confidence: 'estimated',
        })
      }
    }
  }

  function handleGemini(response: Response, body?: unknown) {
    const userText = extractGeminiUserText(body)
    const reqId = ++requestCounter
    try {
      response.clone().text().then((text) => {
        processGeminiText(text, userText, reqId)
      }).catch(() => {})
    } catch {}
  }

  // ════════════════════════════════════════════════════════════════
  // FETCH INTERCEPTOR HOOK
  // ════════════════════════════════════════════════════════════════
  window.fetch = async function(...args: Parameters<typeof fetch>): Promise<Response> {
    const response = await originalFetch.apply(this, args)

    let rawUrl = ''
    if (typeof args[0] === 'string') rawUrl = args[0]
    else if (args[0] instanceof URL) rawUrl = args[0].href
    else if (args[0] instanceof Request) rawUrl = args[0].url

    const url = resolveUrl(rawUrl)
    const path = url.split('?')[0]
    const method = ((args[1]?.method) ?? (args[0] instanceof Request ? args[0].method : 'GET')).toUpperCase()

    let body = args[1]?.body
    if (!body && args[0] instanceof Request) {
      try {
        body = await args[0].clone().text()
      } catch {}
    }

    try {
      if (response.status === 429) {
        if (url.includes('claude.ai')) handleRateLimitError('claude', response)
        else if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) handleRateLimitError('chatgpt', response)
        else if (url.includes('gemini.google.com')) handleRateLimitError('gemini', response)
      }

      if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && path.includes('/conversation') && method === 'POST') {
        handleChatGPTFetch(response, body)
      } else if (url.includes('claude.ai') && (path.includes('/completion') || path.includes('/chat_conversations') || path.includes('/messages') || path.includes('/conversations')) && method === 'POST') {
        handleClaudeFetch(response, body)
      } else if (url.includes('gemini.google.com') || path.includes('BardChatUi') || path.includes('StreamGenerate') || path.includes('batchrunquery')) {
        handleGemini(response, body)
      }
    } catch (e) {
      log('fetch handler error', e)
    }

    return response
  }

  // ════════════════════════════════════════════════════════════════
  // XHR INTERCEPTOR HOOK
  // ════════════════════════════════════════════════════════════════
  XHR.prototype.open = function(method: string, url: string | URL, ...rest: any[]) {
    ; (this as any).__traceMethod = String(method).toUpperCase()
    ; (this as any).__traceUrl = resolveUrl(String(url))
    return origOpen.apply(this, [method, url, ...rest] as any)
  }

  XHR.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
    const url = (this as any).__traceUrl as string | undefined ?? ''
    const method = (this as any).__traceMethod as string | undefined ?? 'GET'
    const path = url.split('?')[0]

    try {
      if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && path.includes('/conversation') && method === 'POST') {
        const { userText, modelName } = extractChatGPTRequestText(body)
        const reqId = ++requestCounter
        const eventId = createEventId('chatgpt', reqId)
        let assistantText = ''
        let lastLen = 0, buffer = ''
        this.addEventListener('readystatechange', () => {
          if (this.responseType === 'arraybuffer' || this.responseType === 'blob') return
          let text: string
          try { text = this.responseText } catch { return }
          buffer += text.slice(lastLen)
          lastLen = text.length
          buffer = parseSSELines(buffer, (raw) => {
            if (raw === '[DONE]') return
            try {
              const d = JSON.parse(raw)
              if (d?.message?.author?.role === 'assistant') {
                const t = extractTextDeep(d.message?.content?.parts)
                if (t && t.length > assistantText.length) assistantText = t
              }
            } catch {}
          })
          if (this.readyState === 4 && (userText || assistantText)) {
            dispatch('chatgpt', {
              eventId,
              userText,
              assistantText,
              modelName,
              contextLimit: 128000,
              source: 'tokenizer',
              confidence: 'estimated',
            })
          }
        })
      } else if (url.includes('gemini.google.com') || path.includes('BardChatUi') || path.includes('StreamGenerate') || path.includes('batchrunquery')) {
        const userText = extractGeminiUserText(body)
        const reqId = ++requestCounter
        this.addEventListener('readystatechange', () => {
          if (this.readyState === 4) {
            if (this.responseType === 'arraybuffer' || this.responseType === 'blob') return
            let text = ''
            try { text = this.responseText } catch { return }
            processGeminiText(text, userText, reqId)
          }
        })
      }
    } catch (e) {
      log('xhr handler error', e)
    }

    return origSend.apply(this, [body] as any)
  }

  log('Trace secure interceptor loaded. Nonce initialized.')
})()
