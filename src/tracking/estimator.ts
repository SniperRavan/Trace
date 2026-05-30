/**
 * src/tracking/estimator.ts
 * Token estimation — ~4 chars/token heuristic with response overhead.
 */

const CHARS_PER_TOKEN    = 4
const RESPONSE_MULTIPLIER = 1.8
const SYSTEM_OVERHEAD    = 800

export function estimateTokens(text: string): number {
  const promptTokens   = Math.ceil(text.length / CHARS_PER_TOKEN)
  const responseTokens = Math.ceil(promptTokens * RESPONSE_MULTIPLIER)
  return promptTokens + responseTokens + SYSTEM_OVERHEAD
}

export function estimateFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

export function formatResetTime(resetAt: number): string {
  const diff = resetAt - Date.now()
  if (diff <= 0) return 'resetting'
  const totalMins = Math.floor(diff / 60000)
  if (totalMins < 1) return '< 1m'
  const hours = Math.floor(totalMins / 60)
  const mins  = totalMins % 60
  if (hours === 0) return `${mins}m`
  if (mins  === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
