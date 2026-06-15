import { defineStore } from 'pinia'

export type ViewMode = 'chat' | 'graph'
export type ThemeMode = 'system' | 'light' | 'dark'
export type ProviderMode = 'server' | 'custom'

export type ChatNodeStatus = 'complete' | 'streaming' | 'stopped'

export type ChatNode = {
  id: string
  parentId: string | null
  userText: string
  assistantText: string
  createdAt: string
  status?: ChatNodeStatus
  position?: {
    x: number
    y: number
  }
  includeInContext?: boolean
}

type ProviderSettings = {
  baseURL: string
  apiKey: string
  model: string
}

type ProviderConfigResponse = {
  baseURL: string
  model: string
  hasApiKey: boolean
}

type ErrorDialog = {
  title: string
  message: string
}

const THEME_STORAGE_KEY = 'branchy-chat-theme'
const PROVIDER_MODE_STORAGE_KEY = 'branchy-chat-provider-mode'
const STREAM_ERROR_MARKER = '[[BRANCHY_CHAT_STREAM_ERROR]]'
let activeAbortController: AbortController | null = null

class ChatRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ChatRequestError'
  }
}

function applyDocumentTheme(themeMode: ThemeMode) {
  if (typeof document === 'undefined') return

  if (themeMode === 'system') {
    document.documentElement.removeAttribute('data-theme')
    return
  }

  document.documentElement.dataset.theme = themeMode
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
  )
}

function getReadableErrorMessage(error: unknown) {
  if (error instanceof ChatRequestError) {
    const prefix = error.status ? `HTTP ${error.status}` : '请求失败'
    return `${prefix}：${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return '请求失败，请检查 API 设置后重试。'
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const value = payload.trim()
    if (!value) return null

    try {
      return extractErrorMessage(JSON.parse(value)) ?? value
    } catch {
      return value
    }
  }

  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  const candidates = [
    record.statusMessage,
    record.message,
    record.error,
    record.cause,
    record.responseBody,
    record.body,
    typeof record.data === 'object' && record.data
      ? (record.data as Record<string, unknown>).message
      : null,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }

    if (candidate) {
      const nestedMessage = extractErrorMessage(candidate)
      if (nestedMessage) return nestedMessage
    }
  }

  return null
}

function extractErrorStatus(payload: unknown): number | null {
  if (typeof payload === 'string') {
    try {
      return extractErrorStatus(JSON.parse(payload))
    } catch {
      return null
    }
  }

  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  const candidates = [record.status, record.statusCode]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isInteger(candidate)) {
      return candidate
    }
  }

  for (const candidate of [record.error, record.cause, record.response, record.data]) {
    const status = extractErrorStatus(candidate)
    if (status) return status
  }

  return null
}

async function createResponseError(response: Response) {
  const rawText = await response.text()
  let message = rawText.trim()

  try {
    message = extractErrorMessage(JSON.parse(rawText)) ?? message
  } catch {
    // Keep the raw text for non-JSON error responses.
  }

  if (!message || message.includes('<!DOCTYPE html>') || message.includes('<html')) {
    message = '服务返回了网页而不是 API 错误信息，请检查 Base URL。'
  }

  if (response.status === 401 || response.status === 403) {
    message = `鉴权失败，请检查 API Key。${message ? `\n\n${message}` : ''}`
  } else if (response.status === 400 || response.status === 404) {
    message = `请求参数可能不正确，请检查模型名和接口地址。${message ? `\n\n${message}` : ''}`
  } else if (response.status >= 500) {
    message = `服务端或模型接口暂时不可用。${message ? `\n\n${message}` : ''}`
  }

  return new ChatRequestError(message.slice(0, 1200), response.status)
}

function createStreamError(payload: string) {
  try {
    const errorPayload = JSON.parse(payload)

    return new ChatRequestError(
      extractErrorMessage(errorPayload) ?? '模型接口请求失败，请检查 API 设置后重试。',
      extractErrorStatus(errorPayload) ?? 502,
    )
  } catch {
    return new ChatRequestError('模型接口请求失败，请检查 API 设置后重试。', 502)
  }
}

const seedNodes: ChatNode[] = [
  {
    id: 'root',
    parentId: null,
    userText: '欢迎来到Branchy Chat',
    assistantText: '这是一个基于类git的分支式AI聊天工具。利用Control + . 切换到节点图模式来查看更多！\n输入base URL和API key开始你的对话！',
    createdAt: '20:30',
    includeInContext: false,
  }
]

function createNodeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `node-${crypto.randomUUID()}`
  }

  return `node-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    mode: 'chat' as ViewMode,
    activeNodeId: 'root',
    draft: '',
    isGenerating: false,
    errorMessage: '',
    errorDialog: null as ErrorDialog | null,
    hasConfiguredApiKey: false,
    pendingGraphFocusNodeId: null as string | null,
    themeMode: 'system' as ThemeMode,
    providerMode: 'server' as ProviderMode,
    settings: {
      baseURL: '',
      apiKey: '',
      model: '',
    } satisfies ProviderSettings,
    nodes: seedNodes,
  }),
  getters: {
    activeNode(state) {
      return state.nodes.find((node) => node.id === state.activeNodeId) ?? null
    },
    activePath(state) {
      const byId = new Map(state.nodes.map((node) => [node.id, node]))
      const path: ChatNode[] = []
      let cursor = byId.get(state.activeNodeId)

      while (cursor) {
        path.unshift(cursor)
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      }

      return path
    },
  },
  actions: {
    toggleMode() {
      this.mode = this.mode === 'chat' ? 'graph' : 'chat'
    },
    setMode(mode: ViewMode) {
      this.mode = mode
    },
    openGraphAtNode(nodeId: string) {
      this.activeNodeId = nodeId
      this.pendingGraphFocusNodeId = nodeId
      this.mode = 'graph'
    },
    consumePendingGraphFocusNodeId() {
      const nodeId = this.pendingGraphFocusNodeId
      this.pendingGraphFocusNodeId = null
      return nodeId
    },
    selectNode(nodeId: string) {
      this.activeNodeId = nodeId
      this.mode = 'chat'
    },
    deleteNodeWithDescendants(nodeId: string) {
      const target = this.nodes.find((node) => node.id === nodeId)
      if (!target || target.parentId === null || this.isGenerating) return

      const idsToDelete = new Set<string>([nodeId])
      let changed = true

      while (changed) {
        changed = false
        for (const node of this.nodes) {
          if (node.parentId && idsToDelete.has(node.parentId) && !idsToDelete.has(node.id)) {
            idsToDelete.add(node.id)
            changed = true
          }
        }
      }

      this.nodes = this.nodes.filter((node) => !idsToDelete.has(node.id))

      if (idsToDelete.has(this.activeNodeId)) {
        this.activeNodeId = target.parentId
      }
    },
    updateNodePosition(nodeId: string, position: { x: number; y: number }) {
      const node = this.nodes.find((item) => item.id === nodeId)
      if (!node) return

      node.position = position
    },
    resetNodePositions() {
      for (const node of this.nodes) {
        delete node.position
      }
    },
    loadUiPreferences() {
      if (typeof localStorage === 'undefined') {
        applyDocumentTheme(this.themeMode)
        return
      }

      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
      if (storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark') {
        this.themeMode = storedTheme
      }

      const storedProviderMode = localStorage.getItem(PROVIDER_MODE_STORAGE_KEY)
      if (storedProviderMode === 'server' || storedProviderMode === 'custom') {
        this.providerMode = storedProviderMode
      }

      applyDocumentTheme(this.themeMode)
    },
    setThemeMode(themeMode: ThemeMode) {
      this.themeMode = themeMode
      applyDocumentTheme(themeMode)

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, themeMode)
      }
    },
    setProviderMode(providerMode: ProviderMode) {
      this.providerMode = providerMode

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PROVIDER_MODE_STORAGE_KEY, providerMode)
      }
    },
    async loadProviderDefaults() {
      const config = await $fetch<ProviderConfigResponse>('/api/config')

      if (!this.settings.baseURL) {
        this.settings.baseURL = config.baseURL
      }

      if (!this.settings.model) {
        this.settings.model = config.model
      }

      this.hasConfiguredApiKey = config.hasApiKey
    },
    stopGenerating() {
      activeAbortController?.abort()
    },
    clearErrorDialog() {
      this.errorDialog = null
    },
    async sendDraft() {
      const text = this.draft.trim()
      if (!text || this.isGenerating) return

      this.draft = ''
      await this.sendMessage(text, this.activeNodeId, {
        restoreDraftOnError: true,
      })
    },
    async sendMessage(
      text: string,
      parentId: string,
      options: {
        restoreDraftOnError?: boolean
      } = {},
    ) {
      const previousActiveNodeId = this.activeNodeId
      const id = createNodeId()
      this.nodes.push({
        id,
        parentId,
        userText: text,
        assistantText: '',
        createdAt: new Intl.DateTimeFormat('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date()),
        status: 'streaming',
      })
      this.activeNodeId = id
      this.errorMessage = ''
      this.isGenerating = true
      activeAbortController = new AbortController()

      try {
        const messages = this.activePath
          .filter((node) => node.includeInContext !== false)
          .flatMap((node) => {
            const items = [{ role: 'user' as const, content: node.userText }]

            if (node.assistantText.trim()) {
              items.push({ role: 'assistant' as const, content: node.assistantText })
            }

            return items
          })

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            settings: this.providerMode === 'custom' ? this.settings : {},
            messages,
          }),
          signal: activeAbortController.signal,
        })

        if (!response.ok) {
          throw await createResponseError(response)
        }

        if (!response.body) {
          throw new ChatRequestError('服务没有返回可读取的响应流。', response.status)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let streamBuffer = ''

        const appendAssistantText = (content: string) => {
          if (!content) return

          if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
            throw new Error(
              '收到 HTML 页面而不是模型文本。请检查 baseURL 是否填成了网页地址或 Nuxt dev server 地址。',
            )
          }

          const node = this.nodes.find((item) => item.id === id)
          if (node) node.assistantText += content
        }

        const readRemainingErrorPayload = async (initialPayload: string) => {
          let payload = initialPayload

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            payload += decoder.decode(value, { stream: true })
          }

          payload += decoder.decode()
          throw createStreamError(payload)
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            appendAssistantText(streamBuffer + decoder.decode())
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          streamBuffer += chunk

          const markerIndex = streamBuffer.indexOf(STREAM_ERROR_MARKER)
          if (markerIndex !== -1) {
            appendAssistantText(streamBuffer.slice(0, markerIndex))
            await readRemainingErrorPayload(
              streamBuffer.slice(markerIndex + STREAM_ERROR_MARKER.length),
            )
          }

          const safeLength = Math.max(0, streamBuffer.length - STREAM_ERROR_MARKER.length + 1)
          appendAssistantText(streamBuffer.slice(0, safeLength))
          streamBuffer = streamBuffer.slice(safeLength)
        }

        const node = this.nodes.find((item) => item.id === id)
        if (node) node.status = 'complete'
      } catch (error) {
        if (isAbortError(error)) {
          const node = this.nodes.find((item) => item.id === id)
          if (node) node.status = 'stopped'
          return
        }

        const message = getReadableErrorMessage(error)
        this.errorMessage = ''
        this.errorDialog = {
          title: '请求失败',
          message,
        }
        this.nodes = this.nodes.filter((item) => item.id !== id)
        if (this.activeNodeId === id) {
          this.activeNodeId = previousActiveNodeId
        }
        if (options.restoreDraftOnError && !this.draft.trim()) {
          this.draft = text
        }
      } finally {
        this.isGenerating = false
        activeAbortController = null
      }
    },
  },
})
