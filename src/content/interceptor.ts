/* 
 * src/content/interceptor.ts
 * Intercepts fetch, XHR, and WebSocket requests in MAIN world.
 * Dispatches token events to content script adapters via window.postMessage & CustomEvent.
*/

; (function() {
  const DEBUG = true
  const TRACE_MARKER = '__TRACE_EXTENSION__'
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
    try {
      window.postMessage({
        source: TRACE_MARKER,
        type: 'trace:tokens',
        detail: { provider, ...payload }
      }, '*')
    } catch (e) {
      log('postMessage dispatch error', e)
    }

    try {
      window.dispatchEvent(new CustomEvent('trace:tokens', { detail: { provider, ...payload } }))
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
  // ChatGPT — parse prompt + assistant response (supports standard & delta patches)
  // ════════════════════════════════════════════════════════════════
  function extractChatGPTRequestText(body: unknown): string {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body
      const messages = (parsed as any)?.messages
      if (!Array.isArray(messages)) return ''
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m?.author?.role === 'user') {
          if (Array.isArray(m?.content?.parts)) {
            return m.content.parts.filter((p: unknown) => typeof p === 'string').join(' ')
          }
          if (typeof m?.content === 'string') return m.content
        }
      }
      return ''
    } catch { return '' }
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
    const userText = extractChatGPTRequestText(body)
    const clone = response.clone()
    let assistantText = ''
    let lineCount = 0

    readSSE(clone, (raw) => {
      lineCount++
      if (raw === '[DONE]') return
      try {
        const d = JSON.parse(raw)
        // Standard message format
        if (d?.message?.author?.role === 'assistant') {
          const t = extractTextDeep(d.message?.content?.parts)
          if (t && t.length > assistantText.length) assistantText = t
        }
        // Delta patch format ("v" patch objects)
        else if (d?.v) {
          const t = extractTextDeep(d.v)
          if (t) {
            if (typeof d.v === 'string') assistantText += d.v
            else if (t.length > assistantText.length) assistantText = t
          }
        }
      } catch { }
    }).then((sawData) => {
      log('[chatgpt-fetch] done', { sawData, lineCount, userTextLen: userText.length, assistantTextLen: assistantText.length })
      if (userText || assistantText) dispatch('chatgpt', { userText, assistantText })
    })
  }

  // ════════════════════════════════════════════════════════════════
  // Claude — parse prompt + numeric tokens or text streams
  // ════════════════════════════════════════════════════════════════
  function extractClaudeRequestText(body: unknown): string {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body
      if (typeof (parsed as any)?.prompt === 'string') return (parsed as any).prompt
      if (typeof (parsed as any)?.text === 'string') return (parsed as any).text
      if (Array.isArray((parsed as any)?.content)) {
        return (parsed as any).content.filter((c: any) => typeof c?.text === 'string').map((c: any) => c.text).join(' ')
      }
      if (Array.isArray((parsed as any)?.messages)) {
        const last = (parsed as any).messages[(parsed as any).messages.length - 1]
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
      
      // Token usage from Anthropic message events
      if (d.type === 'message_start' && d.message?.usage) {
        state.inputTokens = d.message.usage.input_tokens ?? 0
        state.outputTokens = d.message.usage.output_tokens ?? 0
      }
      if (d.type === 'message_delta' && d.usage) {
        state.outputTokens = d.usage.output_tokens ?? state.outputTokens
        if (d.usage.input_tokens != null) state.inputTokens = d.usage.input_tokens
      }
      
      // Text stream deltas
      if (d.type === 'content_block_delta' && d.delta?.text) {
        state.assistantText += d.delta.text
      } else if (typeof d?.delta?.text === 'string') {
        state.assistantText += d.delta.text
      } else if (typeof d?.completion === 'string') {
        state.assistantText = d.completion
      }
    } catch {
      // non-JSON
    }
  }

  function handleClaudeFetch(response: Response, body: unknown) {
    const userText = extractClaudeRequestText(body)
    const clone = response.clone()
    const state: ClaudeState = { eventTypes: [], inputTokens: 0, outputTokens: 0, assistantText: '' }

    readSSE(clone, (raw) => {
      processClaudeLine(raw, state)
    }).then((sawData) => {
      log('[claude-fetch] done', {
        sawData,
        numeric: { in: state.inputTokens, out: state.outputTokens },
        userTextLen: userText.length, assistantTextLen: state.assistantText.length,
      })

      if (state.inputTokens || state.outputTokens) {
        dispatch('claude', { inputTokens: state.inputTokens, outputTokens: state.outputTokens, totalTokens: state.inputTokens + state.outputTokens })
      } else if (userText || state.assistantText) {
        dispatch('claude', { userText, assistantText: state.assistantText })
      }
    })
  }

  // ════════════════════════════════════════════════════════════════
  // Gemini / Grok / Perplexity
  // ════════════════════════════════════════════════════════════════
  function handleGemini(response: Response) {
    response.clone().text().then((text) => {
      log('[gemini] body length:', text.length)
      const matches = text.matchAll(/\\?"usageMetadata\\?":\s*\\?\{([^}]+)\\?\}/g)
      let lastUsage: { inp: number; out: number } | null = null
      for (const m of matches) {
        try {
          const unescaped = m[1].replace(/\\"/g, '"')
          const meta = JSON.parse('{' + unescaped + '}')
          const inp = meta.promptTokenCount ?? 0
          const out = meta.candidatesTokenCount ?? 0
          if (inp || out) lastUsage = { inp, out }
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
  // FETCH INTERCEPTOR
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
      if (url.includes('claude.ai') && (path.includes('/completion') || path.includes('/chat_conversations')) && method === 'POST') {
        handleClaudeFetch(response, body)
      } else if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && path.includes('/conversation') && method === 'POST') {
        handleChatGPTFetch(response, body)
      } else if (url.includes('gemini.google.com') &&
        (url.includes('StreamGenerate') || url.includes('batchrunquery') || url.includes('lamda') || url.includes('bard'))) {
        handleGemini(response)
      } else if (url.toLowerCase().includes('x.com') && (url.toLowerCase().includes('grok') || url.toLowerCase().includes('add_response'))) {
        handleGrok(response)
      } else if (url.includes('perplexity.ai') && (url.includes('query') || url.includes('search') || url.includes('ask'))) {
        handlePerplexity(response)
      }
    } catch (e) { log('fetch handler error', e) }

    return response
  }

  // ════════════════════════════════════════════════════════════════
  // XHR INTERCEPTOR
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
      if (url.includes('claude.ai') && (path.includes('/completion') || path.includes('/chat_conversations')) && method === 'POST') {
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
      } else if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && path.includes('/conversation') && method === 'POST') {
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

  // ════════════════════════════════════════════════════════════════
  // WEBSOCKET INTERCEPTOR
  // ════════════════════════════════════════════════════════════════
  try {
    const OriginalWebSocket = window.WebSocket
    const PatchedWebSocket = function(this: any, url: string | URL, protocols?: string | string[]) {
      const urlStr = String(url)
      const ws = new OriginalWebSocket(url, protocols)
      
      if (urlStr.includes('perplexity.ai') || window.location.hostname.includes('perplexity.ai')) {
        let assistantText = ''
        let dispatchTimer: any = null
        
        const throttleDispatch = () => {
          if (dispatchTimer) clearTimeout(dispatchTimer)
          dispatchTimer = setTimeout(() => {
            if (assistantText) {
              dispatch('perplexity', { userText: '', assistantText })
            }
          }, 1000)
        }
        
        ws.addEventListener('message', (event) => {
          try {
            const data = event.data
            if (typeof data !== 'string') return
            
            let jsonContent = data
            if (data.startsWith('42')) {
              jsonContent = data.slice(2)
            }
            
            if (jsonContent.startsWith('[') || jsonContent.startsWith('{')) {
              const parsed = JSON.parse(jsonContent)
              
              const findText = (node: any): string => {
                if (!node) return ''
                if (typeof node === 'string') return ''
                if (typeof node.text === 'string') return node.text
                if (typeof node.answer === 'string') return node.answer
                if (typeof node.output === 'string') return node.output
                if (typeof node.completion === 'string') return node.completion
                if (Array.isArray(node)) {
                  for (const child of node) {
                    const t = findText(child)
                    if (t) return t
                  }
                }
                if (typeof node === 'object') {
                  for (const key in node) {
                    const t = findText(node[key])
                    if (t) return t
                  }
                }
                return ''
              }
              
              const text = findText(parsed)
              if (text && text.length > assistantText.length) {
                assistantText = text
                throttleDispatch()
              }
            }
          } catch {}
        })
        
        ws.addEventListener('close', () => {
          if (dispatchTimer) clearTimeout(dispatchTimer)
          if (assistantText) {
            dispatch('perplexity', { userText: '', assistantText })
          }
        })
      }
      
      return ws
    } as any
    
    PatchedWebSocket.prototype = OriginalWebSocket.prototype
    window.WebSocket = PatchedWebSocket
  } catch (e) {
    log('WebSocket patch failed:', e)
  }

  log('interceptor installed on', window.location.hostname, '(enhanced extraction mode)')
})()
