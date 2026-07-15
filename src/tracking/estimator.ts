/**
 * src/tracking/estimator.ts
 */

export function countTokens(text: string): number {
  if (!text) return 0
  // Heuristic for English: ~3.8 characters per token
  return Math.ceil(text.length / 3.8)
}

export function estimateTokens(text: string): number {
  const prompt = countTokens(text)
  const response = Math.ceil(prompt * 2.5)
  return prompt + response
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
  const mins = totalMins % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
