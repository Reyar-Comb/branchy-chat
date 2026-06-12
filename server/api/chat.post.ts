import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText, type ModelMessage } from 'ai'
import { getProviderConfig } from '../utils/provider-config'

type ChatRole = 'system' | 'user' | 'assistant'

type ChatRequestMessage = {
  role: ChatRole
  content: string
}

type ChatRequestBody = {
  settings?: {
    baseURL?: string
    apiKey?: string
    model?: string
  }
  messages?: ChatRequestMessage[]
}

const MAX_MESSAGES = 60
const MAX_MESSAGE_CHARS = 12000
const SHOULD_LOG_AI_REQUESTS = process.env.NODE_ENV !== 'production'

function normalizeBaseURL(baseURL: string) {
  return baseURL.trim().replace(/\/+$/, '')
}

function assertString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} is required`,
    })
  }

  return value.trim()
}

function normalizeMessages(messages: unknown): ModelMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'messages must be a non-empty array',
    })
  }

  return messages.slice(-MAX_MESSAGES).map((message, index) => {
    if (!message || typeof message !== 'object') {
      throw createError({
        statusCode: 400,
        statusMessage: `messages[${index}] must be an object`,
      })
    }

    const role = (message as ChatRequestMessage).role
    const content = (message as ChatRequestMessage).content

    if (!['system', 'user', 'assistant'].includes(role)) {
      throw createError({
        statusCode: 400,
        statusMessage: `messages[${index}].role is invalid`,
      })
    }

    if (typeof content !== 'string' || content.trim() === '') {
      throw createError({
        statusCode: 400,
        statusMessage: `messages[${index}].content is required`,
      })
    }

    return {
      role,
      content: content.slice(0, MAX_MESSAGE_CHARS),
    }
  })
}

function maskSecret(value: string) {
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function parseBodyForLog(body: BodyInit | null | undefined) {
  if (typeof body !== 'string') return body ?? null

  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

async function rejectHTMLResponse(response: Response, url: string) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('text/html')) return response

  const preview = await response.clone().text()

  logAIRequest('provider returned HTML instead of API response', {
    url,
    status: response.status,
    contentType,
    preview: preview.slice(0, 600),
  })

  throw createError({
    statusCode: 502,
    statusMessage:
      'Provider returned HTML. Your baseURL likely points to a web page/dev server instead of an OpenAI-compatible API endpoint. Use something like https://api.openai.com/v1 or http://localhost:1234/v1.',
  })
}

function logAIRequest(label: string, payload: unknown) {
  if (!SHOULD_LOG_AI_REQUESTS) return

  console.log(`\n[api/chat] ${label}`)
  console.dir(payload, {
    depth: null,
    colors: true,
    maxArrayLength: null,
  })
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ChatRequestBody>(event)
  const config = getProviderConfig()

  const baseURL = normalizeBaseURL(assertString(body.settings?.baseURL || config.baseURL, 'baseURL'))
  const apiKey = assertString(body.settings?.apiKey || config.apiKey, 'apiKey')
  const model = assertString(body.settings?.model || config.model, 'model')
  const messages = normalizeMessages(body.messages)

  logAIRequest('incoming request body', {
    settings: {
      baseURL,
      apiKey: maskSecret(apiKey),
      model,
    },
    messages,
  })

  // This supports OpenAI-compatible providers such as OpenAI, OpenRouter,
  // SiliconFlow, LM Studio, Ollama-compatible proxies, and many self-hosted APIs.
  const provider = createOpenAICompatible({
    name: 'custom',
    baseURL,
    apiKey,
    fetch: async (input, init) => {
      logAIRequest('outgoing provider request', {
        url: String(input),
        method: init?.method ?? 'GET',
        headers: {
          ...Object.fromEntries(new Headers(init?.headers).entries()),
          authorization: init?.headers
            ? maskSecret(new Headers(init.headers).get('authorization') ?? '')
            : undefined,
        },
        body: parseBodyForLog(init?.body),
      })

      const response = await globalThis.fetch(input, init)
      return rejectHTMLResponse(response, String(input))
    },
  })

  const result = streamText({
    model: provider(model),
    system:
      'You are a helpful assistant. Keep answers clear and useful. Reply in the user language unless asked otherwise.',
    messages,
    maxOutputTokens: 4096,
  })

  return result.toTextStreamResponse({
    headers: {
      'Cache-Control': 'no-cache',
    },
  })
})
