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
      url.includes('gemini.google.com')
    )
  }

  function handleChatGPTAccountResponse(response: Response) {
    response.clone().json().then((json) => {
      let planType = 'free'
      if (json?.plan_type === 'plus' || json?.plan_type === 'pro' || json?.account_plan?.is_paid_subscription) {
        planType = 'pro'
      } else if (json?.plan_type === 'team') {
        planType = 'team'
      } else if (json?.plan_type === 'enterprise') {
        planType = 'enterprise'
      }
      dispatch('chatgpt', { planType })
    }).catch(() => {})
  }

  function handleClaudeOrgsResponse(response: Response) {
    response.clone().json().then((json) => {
      const orgs = Array.isArray(json) ? json : [json]
      let planType = 'free'
      for (const org of orgs) {
        if (org?.capabilities?.includes('claude_pro') || org?.rate_limit_tier?.includes('pro') || org?.has_pro_subscription) {
          planType = 'pro'
          break
        } else if (org?.rate_limit_tier?.includes('team')) {
          planType = 'team'
          break
        }
      }
      dispatch('claude', { planType })
    }).catch(() => {})
  }

  function handleClaudeUsageResponse(response: Response) {
    response.clone().json().then((json) => {
      log('[claude-usage-api]', json)
      if (json?.five_hour?.utilization != null || json?.seven_day?.utilization != null) {
        const sessionPct = json.five_hour?.utilization != null ? Math.round(json.five_hour.utilization * 100) : undefined
        const weeklyPct = json.seven_day?.utilization != null ? Math.round(json.seven_day.utilization * 100) : undefined
        const resetAtMs = json.five_hour?.resets_at ? new Date(json.five_hour.resets_at).getTime() : undefined
        dispatch('claude', { isExactUsage: true, sessionPct, weeklyPct, resetAtMs })
      }
    }).catch(() => {})
  }

  function dispatch(provider: string, payload: Record<string, unknown>) {
    log('dispatch ->', provider, payload)
    try {
      const targetOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*'
      window.postMessage({
        source: TRACE_MARKER,
        type: 'trace:tokens',
        detail: { provider, ...payload }
      }, targetOrigin)
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
  // ChatGPT — parse prompt + assistant response + auto model name
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
    } catch { }
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
    const clone = response.clone()
    let assistantText = ''
    let lineCount = 0
    let lastDispatchedLength = 0

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
        if (assistantText.length - lastDispatchedLength > 30 || lineCount % 8 === 0) {
          lastDispatchedLength = assistantText.length
          dispatch('chatgpt', { userText, assistantText, modelName, contextLimit: 128000, isStreaming: true })
        }
      } catch { }
    }).then((sawData) => {
      log('[chatgpt-fetch] done', { sawData, modelName, lineCount, userTextLen: userText.length, assistantTextLen: assistantText.length })
      if (userText || assistantText) dispatch('chatgpt', { userText, assistantText, modelName, contextLimit: 128000, isStreaming: false })
    })
  }

  // ════════════════════════════════════════════════════════════════
  // Claude — parse prompt + numeric tokens or text streams
  // ════════════════════════════════════════════════════════════════
  function extractClaudeRequestText(body: unknown): { userText: string; modelName: string } {
    let userText = ''
    let modelName = 'Claude 3.5 Sonnet'
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body
      if (parsed?.model) {
        if (parsed.model.includes('haiku')) modelName = 'Claude 3.5 Haiku'
        else if (parsed.model.includes('opus')) modelName = 'Claude 3 Opus'
        else if (parsed.model.includes('sonnet')) modelName = 'Claude 3.5 Sonnet'
      }
      if (typeof (parsed as any)?.prompt === 'string') userText = (parsed as any).prompt
      else if (typeof (parsed as any)?.text === 'string') userText = (parsed as any).text
      else if (Array.isArray((parsed as any)?.content)) {
        userText = (parsed as any).content.filter((c: any) => typeof c?.text === 'string').map((c: any) => c.text).join(' ')
      } else if (Array.isArray((parsed as any)?.messages)) {
        const last = (parsed as any).messages[(parsed as any).messages.length - 1]
        if (typeof last?.content === 'string') userText = last.content
        else if (Array.isArray(last?.content)) {
          userText = last.content.filter((c: any) => typeof c?.text === 'string').map((c: any) => c.text).join(' ')
        }
      }
    } catch { }
    return { userText, modelName }
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
      
      if (d.type === 'content_block_delta' && d.delta?.text) {
        state.assistantText += d.delta.text
      } else if (typeof d?.delta?.text === 'string') {
        state.assistantText += d.delta.text
      } else if (typeof d?.completion === 'string') {
        state.assistantText = d.completion
      }
    } catch { }
  }

  function handleClaudeFetch(response: Response, body: unknown) {
    const { userText, modelName } = extractClaudeRequestText(body)
    const clone = response.clone()
    const state: ClaudeState = { eventTypes: [], inputTokens: 0, outputTokens: 0, assistantText: '' }

    readSSE(clone, (raw) => {
      processClaudeLine(raw, state)
    }).then((sawData) => {
      log('[claude-fetch] done', {
        sawData, modelName,
        numeric: { in: state.inputTokens, out: state.outputTokens },
        userTextLen: userText.length, assistantTextLen: state.assistantText.length,
      })

      if (state.inputTokens || state.outputTokens) {
        dispatch('claude', { inputTokens: state.inputTokens, outputTokens: state.outputTokens, totalTokens: state.inputTokens + state.outputTokens, modelName, contextLimit: 200000 })
      } else if (userText || state.assistantText) {
        dispatch('claude', { userText, assistantText: state.assistantText, modelName, contextLimit: 200000 })
      }
    })
  }

  // ════════════════════════════════════════════════════════════════
  // Gemini / Grok / Perplexity
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

  function processGeminiText(text: string, userText: string = '') {
    if (!text) return
    log('[gemini] processing response length:', text.length)
    let lastUsage: { inp: number; out: number } | null = null
    const matches = text.matchAll(/\\?"usageMetadata\\?":\s*\\?\{([^}]+)\\?\}/g)
    for (const m of matches) {
      try {
        const unescaped = m[1].replace(/\\"/g, '"')
        const meta = JSON.parse('{' + unescaped + '}')
        const inp = meta.promptTokenCount ?? 0
        const out = meta.candidatesTokenCount ?? 0
        if (inp || out) lastUsage = { inp, out }
      } catch {}
    }

    let modelName = '3.6 Flash'
    let contextLimit = 1000000
    if (text.includes('3.1 Pro') || text.includes('gemini-3.1-pro') || text.includes('3.1')) {
      modelName = '3.1 Pro'
      contextLimit = 2000000
    } else if (text.includes('3.5 Flash-Lite') || text.includes('flash-lite')) {
      modelName = '3.5 Flash-Lite'
      contextLimit = 1000000
    } else if (text.includes('Extended thinking') || text.includes('thinking')) {
      modelName = 'Extended thinking'
      contextLimit = 2000000
    }

    if (lastUsage) {
      log('[gemini] found numeric tokens:', lastUsage)
      dispatch('gemini', {
        inputTokens: lastUsage.inp,
        outputTokens: lastUsage.out,
        totalTokens: lastUsage.inp + lastUsage.out,
        modelName,
        contextLimit,
      })
    } else {
      let assistantText = ''
      const stringMatches = text.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)
      if (stringMatches) {
        for (const sm of stringMatches) {
          const s = sm.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"')
          if (s.length > 20 && !s.startsWith('http') && !s.startsWith('boq_') && !s.startsWith('c_') && !s.includes('batchexecute') && !s.includes('BardChatUi')) {
            assistantText += ' ' + s
          }
        }
      }
      if (!assistantText) {
        assistantText = text.replace(/\\n/g, '\n').replace(/\\"/g, '"').slice(0, 15000)
      }
      if (userText || assistantText.length > 10) {
        log('[gemini] fallback text estimate:', { userLen: userText.length, assistantLen: assistantText.length })
        dispatch('gemini', {
          userText,
          assistantText,
          modelName,
          contextLimit,
        })
      }
    }
  }

  function handleGemini(response: Response, body?: unknown) {
    const userText = extractGeminiUserText(body)
    response.clone().text().then((text) => {
      processGeminiText(text, userText)
    }).catch((e) => log('[gemini] fetch error', e))
  }

  function handleGrok(response: Response) {
    let lastInput = 0, lastOutput = 0
    let assistantText = ''
    readSSE(response.clone(), (raw) => {
      try {
        const d = JSON.parse(raw)
        const usage = d.usage ?? d.result?.usage ?? d.token_budget
        if (usage) {
          lastInput = usage.input_tokens ?? usage.prompt_tokens ?? lastInput
          lastOutput = usage.output_tokens ?? usage.completion_tokens ?? lastOutput
        }
        if (typeof d?.result?.response?.token === 'string') assistantText += d.result.response.token
        else if (typeof d?.result?.message === 'string') assistantText += d.result.message
        else if (typeof d?.token === 'string') assistantText += d.token
      } catch { }
    }).then((sawData) => {
      log('[grok] sawSSE=', sawData, 'tokens=', { lastInput, lastOutput }, 'assistantLen=', assistantText.length)
      if (lastInput || lastOutput) {
        dispatch('grok', { inputTokens: lastInput, outputTokens: lastOutput, totalTokens: lastInput + lastOutput, modelName: 'Grok 2', contextLimit: 128000 })
      } else if (assistantText) {
        dispatch('grok', { userText: '', assistantText, modelName: 'Grok 2', contextLimit: 128000 })
      }
    })
  }

  function handlePerplexity(response: Response) {
    let lastInput = 0, lastOutput = 0
    let assistantText = ''
    readSSE(response.clone(), (raw) => {
      try {
        const d = JSON.parse(raw)
        const usage = d.usage ?? d.choices?.[0]?.usage
        if (usage) {
          lastInput = usage.prompt_tokens ?? lastInput
          lastOutput = usage.completion_tokens ?? lastOutput
        }
        const chunk = d.choices?.[0]?.delta?.content ?? d.text ?? d.output
        if (typeof chunk === 'string') assistantText += chunk
      } catch { }
    }).then((sawData) => {
      log('[perplexity] sawSSE=', sawData, 'tokens=', { lastInput, lastOutput }, 'assistantLen=', assistantText.length)
      if (lastInput || lastOutput) {
        dispatch('perplexity', { inputTokens: lastInput, outputTokens: lastOutput, totalTokens: lastInput + lastOutput, modelName: 'Sonar Pro', contextLimit: 128000 })
      } else if (assistantText) {
        dispatch('perplexity', { userText: '', assistantText, modelName: 'Sonar Pro', contextLimit: 128000 })
      }
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
      if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && (path.includes('/me') || path.includes('/accounts/check'))) {
        handleChatGPTAccountResponse(response)
      } else if (url.includes('claude.ai') && path.includes('/organizations')) {
        handleClaudeOrgsResponse(response)
      } else if (url.includes('claude.ai') && path.includes('/usage')) {
        handleClaudeUsageResponse(response)
      } else if (url.includes('claude.ai') && (path.includes('/completion') || path.includes('/chat_conversations')) && method === 'POST') {
        handleClaudeFetch(response, body)
      } else if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && path.includes('/conversation') && method === 'POST') {
        handleChatGPTFetch(response, body)
      } else if (url.includes('gemini.google.com') || path.includes('BardChatUi') || path.includes('StreamGenerate') || path.includes('batchrunquery')) {
        handleGemini(response, body)
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
        const { userText, modelName } = extractClaudeRequestText(body)
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
              dispatch('claude', { inputTokens: state.inputTokens, outputTokens: state.outputTokens, totalTokens: state.inputTokens + state.outputTokens, modelName, contextLimit: 200000 })
            } else if (userText || state.assistantText) {
              dispatch('claude', { userText, assistantText: state.assistantText, modelName, contextLimit: 200000 })
            }
          }
        })
      } else if ((url.includes('chatgpt.com') || url.includes('chat.openai.com')) && path.includes('/conversation') && method === 'POST') {
        const { userText, modelName } = extractChatGPTRequestText(body)
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
            if (userText || assistantText) dispatch('chatgpt', { userText, assistantText, modelName, contextLimit: 128000 })
          }
        })
      } else if (url.includes('gemini.google.com') || path.includes('BardChatUi') || path.includes('StreamGenerate') || path.includes('batchrunquery')) {
        const userText = extractGeminiUserText(body)
        this.addEventListener('readystatechange', () => {
          if (this.readyState === 4) {
            let text = ''
            try { text = this.responseText } catch { return }
            log('[gemini-xhr] done', { userTextLen: userText.length, responseLen: text.length })
            processGeminiText(text, userText)
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
