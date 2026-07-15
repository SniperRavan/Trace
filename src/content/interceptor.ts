/* 
 * src/content/interceptor.ts
*/

; (function() {
  const DEBUG = true
  const originalFetch = window.fetch
  const XHR = window.XMLHttpRequest
  const origOpen = XHR.prototype.open
  const origSend = XHR.prototype.send

  function log(...args: unknown[]) {
    if (DEBUG) console.log('[Trace]', ...args)
  }

  function resolveUrl(url: string): string {
    try { return new URL(url, location.href).href } catch { return url }
  }

  function isProviderUrl(url: string): boolean {
    return (
      url.includes('claude.ai') ||
      url.includes('chatgpt.com') || url.includes('chat.openai.com') ||
      url.includes('gemini.google.com') ||
      url.includes('x.com') ||
      url.includes('perplexity.ai')
    )
  }

  function dispatch(provider: string, payload: Record<string, unknown>) {
    log('dispatch ->', provider, payload)
    window.dispatchEvent(new CustomEvent('trace:tokens', { detail: { provider, ...payload } }))
  }

  function parseSSELines(buffer: string, onLine: (line: string) => void): string {
    const lines = buffer.split('\n')
    const rest = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data:')) onLine(line.slice(5).trim())
    }
    return rest
  }

  async function readSSE(response: Response, onLine: (line: string) => void): Promise<boolean> {
    let sawData = false
    try {
      const reader = response.body?.getReader()
      if (!reader) return sawData
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = parseSSELines(buffer, (line) => { sawData = true; onLine(line) })
      }
    } catch (e) { log('readSSE error', e) }
    return sawData
  }

  // ════════════════════════════════════════════════════════════════
  // ChatGPT — extract real prompt + response text, tokenize downstream
  // ════════════════════════════════════════════════════════════════
  function extractChatGPTRequestText(body: unknown): string {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : null
      const messages = parsed?.messages
      if (!Array.isArray(messages)) return ''
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m?.author?.role === 'user' && Array.isArray(m?.content?.parts)) {
          return m.content.parts.filter((p: unknown) => typeof p === 'string').join(' ')
        }
      }
      return ''
    } catch { return '' }
  }

  function extractTextDeep(node: unknown, depth = 0): string {
    if (depth > 4) return ''
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(n => extractTextDeep(n, depth + 1)).join('')
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      if (typeof obj.text === 'string') return obj.text
      if (Array.isArray(obj.parts)) return extractTextDeep(obj.parts, depth + 1)
    }
    return ''
  }

  function extractChatGPTAssistantText(d: any): string | null {
    const msg = d?.message
    if (!msg) return null
    if (msg?.author?.role !== 'assistant') return null
    if (msg?.recipient && msg.recipient !== 'all') return null
    const ct = msg?.content?.content_type
    if (ct && ct !== 'text' && ct !== 'multimodal_text') return null
    const t = extractTextDeep(msg.content?.parts)
    return t || null
  }
  function handleChatGPTFetch(response: Response, body: unknown) {
    const userText = extractChatGPTRequestText(body)
    const clone = response.clone()
    let assistantText = ''
    let lineCount = 0
    const samples: string[] = []

    readSSE(clone, (raw) => {
      lineCount++
      if (samples.length < 3) samples.push(raw.slice(0, 200))
      if (raw === '[DONE]') return
      try {
        const d = JSON.parse(raw)
        const t = extractChatGPTAssistantText(d)
        if (t) assistantText = t
      } catch { }
    }).then((sawData) => {
      log('[chatgpt-fetch] done', { sawData, lineCount, userTextLen: userText.length, assistantTextLen: assistantText.length })
      log('[chatgpt-fetch] samples', samples)
      log('[chatgpt-fetch] userText', userText.slice(0, 200))
      log('[chatgpt-fetch] assistantText', assistantText.slice(0, 200))
      if (userText || assistantText) dispatch('chatgpt', { userText, assistantText })
    })
  }

  // ════════════════════════════════════════════════════════════════
  // Claude — same text-extraction approach, plus numeric path kept
  // as a bonus if Anthropic's public SSE event names happen to match
  // ════════════════════════════════════════════════════════════════
  function extractClaudeRequestText(body: unknown): string {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : null
      if (typeof parsed?.prompt === 'string') return parsed.prompt
      if (typeof parsed?.text === 'string') return parsed.text
      if (Array.isArray(parsed?.content)) {
        return parsed.content.filter((c: any) => typeof c?.text === 'string').map((c: any) => c.text).join(' ')
      }
      if (Array.isArray(parsed?.messages)) {
        const last = parsed.messages[parsed.messages.length - 1]
        if (typeof last?.content === 'string') return last.content
        if (Array.isArray(last?.content)) {
          return last.content.filter((c: any) => typeof c?.text === 'string').map((c: any) => c.text).join(' ')
        }
      }
      return ''
    } catch { return '' }
  }

  type ClaudeState = { eventTypes: string[]; inputTokens: number; outputTokens: number; assistantText: string }

  function processClaudeLine(raw: string, state: ClaudeState) {
    try {
      const d = JSON.parse(raw)
      if (d.type) state.eventTypes.push(d.type)
      if (d.type === 'message_start' && d.message?.usage) {
        state.inputTokens = d.message.usage.input_tokens ?? 0
        state.outputTokens = d.message.usage.output_tokens ?? 0
      }
      if (d.type === 'message_delta' && d.usage) {
        state.outputTokens = d.usage.output_tokens ?? state.outputTokens
        if (d.usage.input_tokens != null) state.inputTokens = d.usage.input_tokens
      }
      const deltaText = d?.delta?.text
      if (typeof deltaText === 'string') state.assistantText += deltaText
      if (typeof d?.completion === 'string') state.assistantText = d.completion
    } catch {
      log('[claude] non-JSON line:', raw.slice(0, 120))
    }
  }

  function handleClaudeFetch(response: Response, body: unknown) {
    const userText = extractClaudeRequestText(body)
    const clone = response.clone()
    const state: ClaudeState = { eventTypes: [], inputTokens: 0, outputTokens: 0, assistantText: '' }
    let lineCount = 0
    const samples: string[] = []

    readSSE(clone, (raw) => {
      lineCount++
      if (samples.length < 5) samples.push(raw.slice(0, 200))
      processClaudeLine(raw, state)
    }).then((sawData) => {
      log('[claude-fetch] done', {
        sawData, lineCount, eventTypes: state.eventTypes,
        numeric: { in: state.inputTokens, out: state.outputTokens },
        userTextLen: userText.length, assistantTextLen: state.assistantText.length,
      })
      log('[claude-fetch] samples', samples)
      log('[claude-fetch] userText', userText.slice(0, 200))
      log('[claude-fetch] assistantText', state.assistantText.slice(0, 200))

      if (state.inputTokens || state.outputTokens) {
        dispatch('claude', { inputTokens: state.inputTokens, outputTokens: state.outputTokens, totalTokens: state.inputTokens + state.outputTokens })
      } else if (userText || state.assistantText) {
        dispatch('claude', { userText, assistantText: state.assistantText })
      } else if (!sawData) {
        response.clone().json().then((j) => log('[claude-fetch] non-SSE body:', JSON.stringify(j).slice(0, 500))).catch(() => { })
      }
    })
  }

  // ── Gemini / Grok / Perplexity — unchanged numeric-usage approach ──
  function handleGemini(response: Response) {
    response.clone().text().then((text) => {
      log('[gemini] body length:', text.length, 'preview:', text.slice(0, 200))
      const matches = text.matchAll(/\\?"usageMetadata\\?":\s*\\?\{([^}]+)\\?\}/g)
      let lastUsage: { inp: number; out: number } | null = null
      for (const m of matches) {
        try {
          const unescaped = m[1].replace(/\\"/g, '"')
          const meta = JSON.parse('{' + unescaped + '}')
          const inp = meta.promptTokenCount ?? 0
          const out = meta.candidatesTokenCount ?? 0
          if (inp || out) {
            lastUsage = { inp, out }
          }
        } catch { }
      }
      if (lastUsage) {
        dispatch('gemini', { inputTokens: lastUsage.inp, outputTokens: lastUsage.out, totalTokens: lastUsage.inp + lastUsage.out })
      }
    }).catch((e) => log('[gemini] error', e))
  }

  function handleGrok(response: Response) {
    let lastInput = 0, lastOutput = 0
    readSSE(response.clone(), (raw) => {
      try {
        const d = JSON.parse(raw)
        const usage = d.usage ?? d.result?.usage ?? d.token_budget
        if (usage) {
          lastInput = usage.input_tokens ?? usage.prompt_tokens ?? lastInput
          lastOutput = usage.output_tokens ?? usage.completion_tokens ?? lastOutput
        }
      } catch { }
    }).then((sawData) => {
      log('[grok] sawSSE=', sawData, 'tokens=', { lastInput, lastOutput })
      if (lastInput || lastOutput) dispatch('grok', { inputTokens: lastInput, outputTokens: lastOutput, totalTokens: lastInput + lastOutput })
    })
  }

  function handlePerplexity(response: Response) {
    let lastInput = 0, lastOutput = 0
    readSSE(response.clone(), (raw) => {
      try {
        const d = JSON.parse(raw)
        const usage = d.usage ?? d.choices?.[0]?.usage
        if (usage) {
          lastInput = usage.prompt_tokens ?? lastInput
          lastOutput = usage.completion_tokens ?? lastOutput
        }
      } catch { }
    }).then((sawData) => {
      log('[perplexity] sawSSE=', sawData, 'tokens=', { lastInput, lastOutput })
      if (lastInput || lastOutput) dispatch('perplexity', { inputTokens: lastInput, outputTokens: lastOutput, totalTokens: lastInput + lastOutput })
    })
  }

  // ════════════════════════════════════════════════════════════════
  // FETCH
  // ════════════════════════════════════════════════════════════════
  window.fetch = async function(...args: Parameters<typeof fetch>): Promise<Response> {
    const response = await originalFetch.apply(this, args)

    let rawUrl = ''
    if (typeof args[0] === 'string') {
      rawUrl = args[0]
    } else if (args[0] instanceof URL) {
      rawUrl = args[0].href
    } else if (args[0] instanceof Request) {
      rawUrl = args[0].url
    }

    const url = resolveUrl(rawUrl)
    const path = url.split('?')[0]
    const method = ((args[1]?.method) ?? (args[0] instanceof Request ? args[0].method : 'GET')).toUpperCase()
    
    let body = args[1]?.body
    if (!body && args[0] instanceof Request) {
      try {
        body = await args[0].clone().text()
      } catch {}
    }

    if (isProviderUrl(url)) log('fetch', method, url)

    try {
      if (url.includes('claude.ai') && path.endsWith('/completion') && method === 'POST') {
        handleClaudeFetch(response, body)
      } else if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && path.endsWith('/conversation') && method === 'POST') {
        handleChatGPTFetch(response, body)
      } else if (url.includes('gemini.google.com') &&
        (url.includes('StreamGenerate') || url.includes('batchrunquery') || url.includes('lamda'))) {
        handleGemini(response)
      } else if (url.toLowerCase().includes('x.com') && (url.toLowerCase().includes('grok') || url.toLowerCase().includes('add_response'))) {
        handleGrok(response)
      } else if (url.includes('perplexity.ai') && (url.includes('query') || url.includes('search'))) {
        handlePerplexity(response)
      }
    } catch (e) { log('fetch handler error', e) }

    return response
  }

  // ════════════════════════════════════════════════════════════════
  // XHR — same extraction logic via accumulated responseText
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

    if (isProviderUrl(url)) log('xhr', method, url)

    try {
      if (url.includes('claude.ai') && path.endsWith('/completion') && method === 'POST') {
        const userText = extractClaudeRequestText(body)
        const state: ClaudeState = { eventTypes: [], inputTokens: 0, outputTokens: 0, assistantText: '' }
        let lastLen = 0, buffer = ''
        this.addEventListener('readystatechange', () => {
          let text: string
          try { text = this.responseText } catch { return }
          buffer += text.slice(lastLen); lastLen = text.length
          buffer = parseSSELines(buffer, (raw) => processClaudeLine(raw, state))
          if (this.readyState === 4) {
            log('[claude-xhr] done', { eventTypes: state.eventTypes, numeric: { in: state.inputTokens, out: state.outputTokens }, userTextLen: userText.length, assistantTextLen: state.assistantText.length })
            if (state.inputTokens || state.outputTokens) {
              dispatch('claude', { inputTokens: state.inputTokens, outputTokens: state.outputTokens, totalTokens: state.inputTokens + state.outputTokens })
            } else if (userText || state.assistantText) {
              dispatch('claude', { userText, assistantText: state.assistantText })
            }
          }
        })
      } else if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && path.endsWith('/conversation') && method === 'POST') {
        const userText = extractChatGPTRequestText(body)
        let assistantText = ''
        let lastLen = 0, buffer = ''
        this.addEventListener('readystatechange', () => {
          let text: string
          try { text = this.responseText } catch { return }
          buffer += text.slice(lastLen); lastLen = text.length
          buffer = parseSSELines(buffer, (raw) => {
            if (raw === '[DONE]') return
            try {
              const d = JSON.parse(raw)
              const t = extractChatGPTAssistantText(d)
              if (t) assistantText = t
            } catch { }
          })
          if (this.readyState === 4) {
            log('[chatgpt-xhr] done', { userTextLen: userText.length, assistantTextLen: assistantText.length })
            if (userText || assistantText) dispatch('chatgpt', { userText, assistantText })
          }
        })
      }
    } catch (e) { log('xhr handler error', e) }

    return origSend.apply(this, [body] as any)
  }

  log('interceptor installed on', window.location.hostname, '(text-extraction mode)')
})()
