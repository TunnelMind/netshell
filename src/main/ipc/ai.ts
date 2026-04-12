/**
 * AI Assistant — Ollama HTTP integration.
 * All inference happens locally (localhost:11434) — nothing sent to external services.
 * Supports: command completion, explain output, ask anything about device configs.
 */
import { ipcMain } from 'electron'
import * as https from 'https'
import * as http from 'http'
import { IPC } from '../../types'
import { load } from '../store'

async function ollamaRequest(
  ollamaUrl: string,
  model: string,
  prompt: string,
  onChunk?: (token: string) => void
): Promise<string> {
  const url = new URL('/api/generate', ollamaUrl)
  const body = JSON.stringify({ model, prompt, stream: !!onChunk })
  const lib = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 11434),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 60000,
      },
      (res) => {
        let full = ''
        res.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter(Boolean)
          for (const line of lines) {
            try {
              const obj = JSON.parse(line)
              if (obj.response) {
                full += obj.response
                onChunk?.(obj.response)
              }
            } catch {}
          }
        })
        res.on('end', () => resolve(full))
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama request timed out')) })
    req.write(body)
    req.end()
  })
}

function buildPrompt(type: 'complete' | 'explain', context: {
  vendor?: string
  sessionType?: string
  input?: string
  output?: string
  question?: string
}): string {
  const vendorHint = context.vendor ? `The device is running ${context.vendor}.` : ''

  if (type === 'complete') {
    return `You are a network engineer assistant. ${vendorHint}
The engineer typed: "${context.input}"
Suggest the most likely CLI command to complete this. Return ONLY the command, no explanation.`
  }

  if (type === 'explain') {
    return `You are a network engineer assistant. ${vendorHint}
Explain this CLI output concisely. Highlight anything unusual, errors, or worth investigating.
Focus on actionable insights for a network/security engineer.

Output:
${context.output}

${context.question ? `Question: ${context.question}` : ''}`
  }

  return context.question ?? ''
}

export function registerAiHandlers(): void {
  // Single-shot completion (returns full response)
  ipcMain.handle(IPC.AI_COMPLETE, async (_event, params: {
    input: string
    vendor?: string
    sessionType?: string
  }) => {
    const settings = load().settings
    if (!settings.aiEnabled) return ''
    const prompt = buildPrompt('complete', params)
    try {
      return await ollamaRequest(
        settings.ollamaUrl ?? 'http://localhost:11434',
        settings.ollamaModel ?? 'llama3.2',
        prompt
      )
    } catch (e: unknown) {
      throw new Error(`Ollama error: ${(e as Error).message}`)
    }
  })

  // Explain terminal output (streaming)
  ipcMain.handle(IPC.AI_STREAM, async (event, params: {
    output: string
    question?: string
    vendor?: string
  }) => {
    const settings = load().settings
    if (!settings.aiEnabled) return ''
    const prompt = buildPrompt('explain', params)
    try {
      const result = await ollamaRequest(
        settings.ollamaUrl ?? 'http://localhost:11434',
        settings.ollamaModel ?? 'llama3.2',
        prompt,
        (token) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC.AI_STREAM, token)
          }
        }
      )
      return result
    } catch (e: unknown) {
      throw new Error(`Ollama error: ${(e as Error).message}`)
    }
  })

  // General question (single-shot)
  ipcMain.handle(IPC.AI_EXPLAIN, async (_event, params: {
    question: string
    context?: string
    vendor?: string
  }) => {
    const settings = load().settings
    if (!settings.aiEnabled) return ''
    const prompt = `You are a network/security/systems engineering assistant.
${params.vendor ? `Device vendor: ${params.vendor}.` : ''}
${params.context ? `Context:\n${params.context}\n` : ''}
Question: ${params.question}
Answer concisely and technically.`
    try {
      return await ollamaRequest(
        settings.ollamaUrl ?? 'http://localhost:11434',
        settings.ollamaModel ?? 'llama3.2',
        prompt
      )
    } catch (e: unknown) {
      throw new Error(`Ollama error: ${(e as Error).message}`)
    }
  })
}
